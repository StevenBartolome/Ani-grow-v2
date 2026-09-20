import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Keyboard, Modal, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAniFeedStyles } from '@/styles/anifeedStyles';
import { SnackbarType } from '@/components/Snackbar';
import { supabase } from '@/lib/supabase';

// Moved here from AniFeedScreen.tsx so the feed schedule can be configured
// from AniWeighScreen instead — Board1 (AniWeigh) is now the board that
// actually checks the clock and triggers the feeder's actuator (see
// board1.ino's checkFeederSchedule()), so schedule control now lives
// alongside it rather than on the feeder's own screen.

function getOrdinalLabel(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function generateDefaultTimes(count: number): string[] {
    const presets: Record<number, string[]> = {
        1: ['08:00 AM'],
        2: ['08:00 AM', '05:00 PM'],
        3: ['08:00 AM', '12:00 PM', '06:00 PM'],
        4: ['07:00 AM', '11:00 AM', '03:00 PM', '07:00 PM'],
        5: ['06:00 AM', '09:30 AM', '01:00 PM', '04:30 PM', '08:00 PM'],
        6: ['06:00 AM', '09:00 AM', '12:00 PM', '03:00 PM', '06:00 PM', '09:00 PM'],
    };
    if (presets[count]) return presets[count];

    // For counts > 6: spread evenly across 14 hours (6 AM to 8 PM)
    const result: string[] = [];
    const startHour = 6;
    const endHour = 20;
    const interval = (endHour - startHour) / Math.max(1, count - 1);
    for (let i = 0; i < count; i++) {
        const totalMinutes = Math.round((startHour + i * interval) * 60);
        const h24 = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const ampm = h24 >= 12 ? 'PM' : 'AM';
        const h12 = h24 % 12 || 12;
        result.push(`${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`);
    }
    return result;
}

function format24to12(time24: string): string {
    if (!time24) return '—';
    const parts = time24.split(':');
    if (parts.length !== 2) return time24;
    const hours24 = parseInt(parts[0], 10);
    const minutes = parts[1];
    if (isNaN(hours24)) return time24;

    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12).padStart(2, '0')}:${minutes} ${ampm}`;
}

function parse12to24(time12: string): string | null {
    const cleaned = time12.trim().toUpperCase();
    const regex12 = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/;
    const match = cleaned.match(regex12);
    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2];
        const ampm = match[3];
        if (hours < 1 || hours > 12) return null;
        const minNum = parseInt(minutes, 10);
        if (minNum < 0 || minNum > 59) return null;

        if (ampm === 'PM' && hours !== 12) {
            hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
            hours = 0;
        }
        return `${String(hours).padStart(2, '0')}:${minutes}`;
    }

    const regex24 = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (regex24.test(cleaned)) {
        return cleaned;
    }
    return null;
}

// board1.ino checks the schedule against its own NTP-synced clock, hardcoded
// to Philippines Time (UTC+8) regardless of where the board is physically
// deployed relative to whoever's using the app. Computing "next dispense"
// against the phone's own local timezone would give a wrong answer for
// anyone outside PHT, so this always works in PHT explicitly, matching the
// board's actual clock.
export function getNextDispenseInfo(times24: string[]): { dayLabel: string; time12: string } | null {
    if (times24.length === 0) return null;
    const nowPHT = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const nowMinutes = nowPHT.getUTCHours() * 60 + nowPHT.getUTCMinutes();

    const sorted = [...times24].sort((a, b) => a.localeCompare(b));
    const minutesOf = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    const nextToday = sorted.find(t => minutesOf(t) >= nowMinutes);
    const chosen = nextToday ?? sorted[0];
    const dayLabel = nextToday ? 'Today' : 'Tomorrow';
    return { dayLabel, time12: format24to12(chosen) };
}

interface FeedScheduleModalProps {
    visible: boolean;
    onClose: () => void;
    deviceId: string;
    farmId: string;
    animalType: string; // 'pig' | 'chicken' (any casing — lowercased before saving)
    showSnackbar: (message: string, type?: SnackbarType) => void;
    onSaved?: () => void;
}

export default function FeedScheduleModal({ visible, onClose, deviceId, farmId, animalType, showSnackbar, onSaved }: FeedScheduleModalProps) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const anifeedStyles = useAniFeedStyles();

    const [isLoading, setIsLoading] = useState(false);
    const [scheduleId, setScheduleId] = useState<string | null>(null);
    const [view, setView] = useState<'schedule' | 'timePicker'>('schedule');
    const [tempTimesPerDay, setTempTimesPerDay] = useState('3');
    const [tempGrams, setTempGrams] = useState('1000');
    const [tempTimes, setTempTimes] = useState<string[]>([]);

    const [activeTimeIdx, setActiveTimeIdx] = useState<number | null>(null);
    const [selectedHour, setSelectedHour] = useState(12);
    const [selectedMinute, setSelectedMinute] = useState(0);
    const [selectedAmPm, setSelectedAmPm] = useState<'AM' | 'PM'>('AM');

    // Pull the device's current schedule fresh every time the modal opens,
    // so it always reflects the latest saved values rather than whatever
    // was in memory from a previous open.
    useEffect(() => {
        if (!visible || !deviceId) return;
        setView('schedule');
        setIsLoading(true);
        (async () => {
            const { data } = await supabase
                .from('feed_schedules')
                .select('id, times_per_day, grams_per_dispense, dispense_times')
                .eq('device_id', deviceId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            const row = data as any;
            setScheduleId(row?.id ?? null);
            const timesPerDay = row?.times_per_day ?? 3;
            const dbTimes: string[] = row?.dispense_times ?? ['08:00', '12:00', '18:00'];
            setTempTimesPerDay(String(timesPerDay));
            setTempGrams(String(row?.grams_per_dispense ?? 1000));
            setTempTimes(dbTimes.map(format24to12));
            setIsLoading(false);
        })();
    }, [visible, deviceId]);

    const updateTimesCount = (newCount: number) => {
        const clamped = Math.max(1, Math.min(12, newCount));
        setTempTimesPerDay(String(clamped));
        setTempTimes(prev => {
            if (prev.length === clamped) return prev;
            if (clamped > prev.length) {
                const defaults = generateDefaultTimes(clamped);
                const next = [...prev];
                for (let i = prev.length; i < clamped; i++) {
                    next.push(defaults[i] || '12:00 PM');
                }
                return next;
            } else {
                return prev.slice(0, clamped);
            }
        });
    };

    const handleSaveSchedule = async () => {
        const timesPerDay = parseInt(tempTimesPerDay);
        const gramsPerDispense = parseInt(tempGrams);
        if (isNaN(timesPerDay) || isNaN(gramsPerDispense) || timesPerDay < 1 || gramsPerDispense < 1) {
            showSnackbar('Enter valid numbers for both fields.', 'error');
            return;
        }

        if (timesPerDay > 12) {
            showSnackbar('Maximum frequency allowed is 12 times per day.', 'error');
            return;
        }

        // The feeder's actuator only dispenses in fixed 1kg cycles — it has
        // no way to release a partial kilo. A value like 500g or 2500g would
        // silently come out as 1000g or 3000g on the actual hardware, so
        // this is caught here rather than letting the mismatch reach the
        // feeder at all.
        if (gramsPerDispense % 1000 !== 0) {
            showSnackbar('Amount per dispense must be a whole number of kilograms (e.g. 1000, 2000, 3000) — the feeder dispenses in fixed 1kg cycles.', 'error');
            return;
        }
        if (gramsPerDispense > 10000) {
            showSnackbar('Amount per dispense cannot exceed 10kg per scheduled time.', 'error');
            return;
        }

        if (tempTimes.length !== timesPerDay) {
            showSnackbar('Please configure all dispense times.', 'error');
            return;
        }

        // Check for duplicate times
        const uniqueTimes = new Set(tempTimes.map(t => t.trim().toUpperCase()));
        if (uniqueTimes.size !== tempTimes.length) {
            showSnackbar('Duplicate dispense times are not allowed. Each feeding must have a unique time.', 'error');
            return;
        }

        // Parse and validate all times to 24-hour format
        const parsed24Times: string[] = [];
        for (let i = 0; i < tempTimes.length; i++) {
            const parsed = parse12to24(tempTimes[i]);
            if (!parsed) {
                showSnackbar(`Invalid format at Time #${i + 1}. Use HH:MM AM/PM format (e.g. 08:30 AM).`, 'error');
                return;
            }
            parsed24Times.push(parsed);
        }

        // Verify time interval is at least 30 minutes
        if (parsed24Times.length > 1) {
            const minutesList = parsed24Times.map(t => {
                const parts = t.split(':');
                return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            });

            // Sort minutes list ascending
            const sortedMinutes = [...minutesList].sort((a, b) => a - b);

            // Check adjacent differences
            for (let i = 0; i < sortedMinutes.length - 1; i++) {
                if (sortedMinutes[i + 1] - sortedMinutes[i] < 30) {
                    showSnackbar('Dispense times must have an interval of at least 30 minutes.', 'error');
                    return;
                }
            }

            // Circular boundary check (last time of day vs first time of next day)
            const circularDiff = (sortedMinutes[0] + 1440) - sortedMinutes[sortedMinutes.length - 1];
            if (circularDiff < 30) {
                showSnackbar('Dispense times must have an interval of at least 30 minutes (including across midnight).', 'error');
                return;
            }
        }

        try {
            const payload = {
                device_id: deviceId,
                farm_id: farmId,
                animal_type: animalType.toLowerCase(),
                times_per_day: timesPerDay,
                grams_per_dispense: gramsPerDispense,
                dispense_times: parsed24Times,
                adjusted_at: new Date().toISOString(),
            };
            if (scheduleId) {
                await supabase.from('feed_schedules').update(payload).eq('id', scheduleId);
            } else {
                const { data } = await supabase.from('feed_schedules').insert(payload).select('id').single();
                setScheduleId((data as any)?.id ?? null);
            }
            showSnackbar('Schedule updated.');
            onSaved?.();
            onClose();
        } catch (err) {
            showSnackbar('Failed to save schedule.', 'error');
        }
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                Keyboard.dismiss();
                if (view === 'timePicker') {
                    setView('schedule');
                } else {
                    onClose();
                }
            }}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}
            >
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => {
                        Keyboard.dismiss();
                        setView('schedule');
                        onClose();
                    }}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                />
                <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 360, maxHeight: '85%', borderRadius: 24, padding: 22, overflow: 'hidden', position: 'relative' }}>
                        {/* Close button */}
                        <TouchableOpacity
                            style={{ position: 'absolute', top: 16, right: 16, padding: 6, zIndex: 10 }}
                            onPress={() => {
                                Keyboard.dismiss();
                                setView('schedule');
                                onClose();
                            }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            activeOpacity={0.7}
                        >
                            <MaterialIcons name="close" size={22} color={colors.textGrey} />
                        </TouchableOpacity>

                        {view === 'schedule' ? (
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center', paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
                                {/* Icon & Title */}
                                <View style={[anifeedStyles.iconContainer, { backgroundColor: colors.primary + '1A', marginBottom: 10, marginTop: 4 }]}>
                                    <MaterialIcons name="edit-calendar" size={30} color={colors.primary} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 4, fontSize: 20, fontWeight: '700' }]}>
                                    Edit Schedule
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 18, fontSize: 13 }]}>
                                    Configure dispensing frequency and times.
                                </Text>

                                {/* Next Dispense — makes it explicit whether the next scheduled
                                    time is today or tomorrow, since a recurring daily time alone
                                    doesn't say that on its own. */}
                                {(() => {
                                    const parsed = tempTimes.map(parse12to24).filter((t): t is string => !!t);
                                    const next = getNextDispenseInfo(parsed);
                                    if (!next) return null;
                                    return (
                                        <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary + '12', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14 }}>
                                            <MaterialIcons name="schedule" size={16} color={colors.primary} />
                                            <Text style={[textStyles.body, { color: colors.primary, fontSize: 12, fontWeight: '600' }]}>
                                                Next dispense: {next.dayLabel} at {next.time12}
                                            </Text>
                                        </View>
                                    );
                                })()}

                                {/* 1. Times Per Day Section */}
                                <View style={{ width: '100%', marginBottom: 18 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }]}>
                                            Times Per Day
                                        </Text>
                                        <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontWeight: '700' }]}>
                                                {tempTimesPerDay}× Daily
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Stepper + Quick Preset Pills */}
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <TouchableOpacity
                                            style={{
                                                width: 38,
                                                height: 38,
                                                borderRadius: 12,
                                                backgroundColor: colors.cardFill,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                            onPress={() => {
                                                const cur = parseInt(tempTimesPerDay, 10) || 1;
                                                updateTimesCount(cur - 1);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="remove" size={18} color={colors.text} />
                                        </TouchableOpacity>

                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                            {[1, 2, 3, 4, 5, 6].map((freq) => {
                                                const isSelected = (parseInt(tempTimesPerDay, 10) || 0) === freq;
                                                return (
                                                    <TouchableOpacity
                                                        key={freq}
                                                        onPress={() => updateTimesCount(freq)}
                                                        activeOpacity={0.7}
                                                        style={{
                                                            paddingHorizontal: 12,
                                                            height: 38,
                                                            borderRadius: 12,
                                                            backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                            borderWidth: 1,
                                                            borderColor: isSelected ? colors.primary : colors.stroke,
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}
                                                    >
                                                        <Text style={[textStyles.body, { color: isSelected ? colors.onPrimary : colors.text, fontWeight: isSelected ? '700' : '500', fontSize: 13 }]}>
                                                            {freq}×
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </ScrollView>

                                        <TouchableOpacity
                                            style={{
                                                width: 38,
                                                height: 38,
                                                borderRadius: 12,
                                                backgroundColor: colors.cardFill,
                                                borderWidth: 1,
                                                borderColor: colors.stroke,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                            onPress={() => {
                                                const cur = parseInt(tempTimesPerDay, 10) || 1;
                                                updateTimesCount(cur + 1);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <MaterialIcons name="add" size={18} color={colors.text} />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {/* 2. Dispense Times List */}
                                <View style={{ width: '100%', marginBottom: 18 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                        <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }]}>
                                            Dispense Times
                                        </Text>
                                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11 }]}>
                                            Tap any time to adjust
                                        </Text>
                                    </View>

                                    <View style={{ width: '100%', gap: 8 }}>
                                        {tempTimes.map((time, idx) => (
                                            <TouchableOpacity
                                                key={idx}
                                                activeOpacity={0.7}
                                                onPress={() => {
                                                    setActiveTimeIdx(idx);
                                                    const cleaned = time.trim().toUpperCase();
                                                    const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
                                                    if (match) {
                                                        const h = parseInt(match[1], 10);
                                                        const m = parseInt(match[2], 10);
                                                        setSelectedHour(h >= 1 && h <= 12 ? h : 12);
                                                        setSelectedMinute(Math.min(55, Math.round(m / 5) * 5));
                                                        setSelectedAmPm(match[3] as 'AM' | 'PM');
                                                    } else {
                                                        setSelectedHour(12);
                                                        setSelectedMinute(0);
                                                        setSelectedAmPm('AM');
                                                    }
                                                    setView('timePicker');
                                                }}
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    backgroundColor: colors.bgLight,
                                                    borderWidth: 1,
                                                    borderColor: colors.stroke,
                                                    borderRadius: 14,
                                                    paddingVertical: 10,
                                                    paddingHorizontal: 14,
                                                }}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Text style={[textStyles.label, { color: colors.primary, fontSize: 11, fontWeight: '700' }]}>
                                                            {idx + 1}
                                                        </Text>
                                                    </View>
                                                    <Text style={[textStyles.body, { color: colors.text, fontSize: 14, fontWeight: '600' }]}>
                                                        {getOrdinalLabel(idx + 1)} Dispense
                                                    </Text>
                                                </View>

                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <View style={{ backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.stroke }}>
                                                        <Text style={[textStyles.body, { color: colors.primary, fontSize: 13, fontWeight: '700' }]}>
                                                            {time}
                                                        </Text>
                                                    </View>
                                                    <MaterialIcons name="edit" size={16} color={colors.primary} />
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                {/* 3. Grams Per Dispense */}
                                <View style={{ width: '100%', marginBottom: 14 }}>
                                    <FloatingLabelInput
                                        label="Grams per dispense"
                                        icon="line-weight"
                                        value={tempGrams}
                                        onChangeText={t => setTempGrams(t.replace(/[^0-9]/g, ''))}
                                        keyboardType="numeric"
                                        backgroundColor={colors.surface}
                                    />
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 11, marginTop: 4 }]}>
                                        Must be a whole number of kilograms — the feeder dispenses in fixed 1kg cycles.
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                                        {[1000, 2000, 3000, 4000].map((amount) => {
                                            const isSelected = tempGrams === String(amount);
                                            return (
                                                <TouchableOpacity
                                                    key={amount}
                                                    onPress={() => setTempGrams(String(amount))}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        flex: 1,
                                                        paddingVertical: 6,
                                                        borderRadius: 8,
                                                        backgroundColor: isSelected ? colors.primary + '18' : colors.cardFill,
                                                        borderWidth: 1,
                                                        borderColor: isSelected ? colors.primary : colors.stroke,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                    }}
                                                >
                                                    <Text style={[textStyles.label, { color: isSelected ? colors.primary : colors.textGrey, fontSize: 11, fontWeight: isSelected ? '700' : '500' }]}>
                                                        {amount}g
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Live Daily Feed Preview Banner */}
                                {(() => {
                                    const count = parseInt(tempTimesPerDay, 10) || 0;
                                    const grams = parseInt(tempGrams, 10) || 0;
                                    const total = count * grams;
                                    return (
                                        <View style={{ width: '100%', backgroundColor: colors.cardFill, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.stroke, marginBottom: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                <MaterialIcons name="calculate" size={18} color={colors.primary} />
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12 }]}>
                                                    Daily Total
                                                </Text>
                                            </View>
                                            <Text style={[textStyles.body, { color: colors.text, fontSize: 13, fontWeight: '700' }]}>
                                                {count} × {grams}g = <Text style={{ color: colors.primary }}>{total.toLocaleString()}g / day</Text>
                                            </Text>
                                        </View>
                                    );
                                })()}

                                {/* Action Buttons */}
                                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            paddingVertical: 13,
                                            borderRadius: 14,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderWidth: 1,
                                            borderColor: colors.stroke,
                                            backgroundColor: colors.cardFill,
                                        }}
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            onClose();
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.btnLabel, { color: colors.text, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            paddingVertical: 13,
                                            borderRadius: 14,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: colors.primary,
                                            opacity: (tempTimesPerDay && tempGrams && tempTimes.length > 0) ? 1 : 0.5,
                                        }}
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            handleSaveSchedule();
                                        }}
                                        activeOpacity={0.7}
                                        disabled={!(tempTimesPerDay && tempGrams && tempTimes.length > 0) || isLoading}
                                    >
                                        <Text style={[textStyles.btnLabel, { color: colors.onPrimary, fontSize: 14, fontWeight: '700' }]}>Save Schedule</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        ) : (
                            /* Time Picker View */
                            <View style={{ alignItems: 'center', width: '100%' }}>
                                {/* Top Navigation */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
                                    <TouchableOpacity
                                        onPress={() => setView('schedule')}
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 18,
                                            backgroundColor: colors.cardFill,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderWidth: 1,
                                            borderColor: colors.stroke,
                                        }}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        activeOpacity={0.7}
                                    >
                                        <MaterialIcons name="arrow-back" size={20} color={colors.text} />
                                    </TouchableOpacity>
                                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 17, fontWeight: '700' }]}>
                                        {activeTimeIdx !== null ? `${getOrdinalLabel(activeTimeIdx + 1)} Dispense Time` : 'Select Time'}
                                    </Text>
                                    <View style={{ width: 36 }} />
                                </View>

                                <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', fontSize: 12, marginBottom: 12 }]}>
                                    Select hour, minute (5-min intervals), and period.
                                </Text>

                                {/* Digital Display Card */}
                                {(() => {
                                    const candidateTime = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')} ${selectedAmPm}`;
                                    const isDuplicateTime = activeTimeIdx !== null && tempTimes.some((t, i) => i !== activeTimeIdx && t.trim().toUpperCase() === candidateTime);
                                    return (
                                        <>
                                            <View style={{ backgroundColor: colors.bgLight, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', marginBottom: isDuplicateTime ? 8 : 12, borderWidth: 1, borderColor: isDuplicateTime ? colors.error : colors.stroke, width: '100%', flexDirection: 'row', gap: 6 }}>
                                                <Text style={[textStyles.h1, { color: isDuplicateTime ? colors.error : colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 }]}>
                                                    {String(selectedHour).padStart(2, '0')}
                                                </Text>
                                                <Text style={[textStyles.h1, { color: isDuplicateTime ? colors.error : colors.primary, fontSize: 30, fontWeight: '800' }]}>:</Text>
                                                <Text style={[textStyles.h1, { color: isDuplicateTime ? colors.error : colors.primary, fontSize: 32, fontWeight: '800', letterSpacing: 0.5 }]}>
                                                    {String(selectedMinute).padStart(2, '0')}
                                                </Text>
                                                <View style={{ backgroundColor: isDuplicateTime ? colors.error : colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginLeft: 8 }}>
                                                    <Text style={[textStyles.label, { color: colors.onPrimary, fontSize: 13, fontWeight: '800' }]}>
                                                        {selectedAmPm}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Duplicate Alert Banner */}
                                            {isDuplicateTime && (
                                                <View style={{ width: '100%', backgroundColor: colors.error + '18', borderWidth: 1, borderColor: colors.error, borderRadius: 12, padding: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <MaterialIcons name="error-outline" size={16} color={colors.error} />
                                                    <Text style={[textStyles.body, { color: colors.error, fontSize: 11, fontWeight: '600', flex: 1 }]}>
                                                        Time is already assigned to another dispense slot.
                                                    </Text>
                                                </View>
                                            )}
                                        </>
                                    );
                                })()}

                                {/* AM / PM Switcher */}
                                <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginBottom: 12 }}>
                                    {(['AM', 'PM'] as const).map((period) => {
                                        const isSelected = selectedAmPm === period;
                                        return (
                                            <TouchableOpacity
                                                key={period}
                                                onPress={() => setSelectedAmPm(period)}
                                                activeOpacity={0.7}
                                                style={{
                                                    flex: 1,
                                                    height: 36,
                                                    borderRadius: 12,
                                                    backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderWidth: 1,
                                                    borderColor: isSelected ? colors.primary : colors.stroke,
                                                }}
                                            >
                                                <Text style={[textStyles.label, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: '700' }]}>
                                                    {period}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                {/* Hours Grid (4 columns x 3 rows) */}
                                <View style={{ width: '100%', marginBottom: 12 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }]}>
                                        Hour
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' }}>
                                        {Array.from({ length: 12 }).map((_, i) => {
                                            const h = i + 1;
                                            const isSelected = selectedHour === h;
                                            return (
                                                <TouchableOpacity
                                                    key={h}
                                                    onPress={() => setSelectedHour(h)}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        width: '23%',
                                                        height: 34,
                                                        borderRadius: 10,
                                                        backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderWidth: 1,
                                                        borderColor: isSelected ? colors.primary : colors.stroke,
                                                    }}
                                                >
                                                    <Text style={[textStyles.body, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 13, fontWeight: isSelected ? '700' : '600' }]}>
                                                        {String(h).padStart(2, '0')}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Minutes Grid (4 columns x 3 rows: 5-minute intervals only) */}
                                <View style={{ width: '100%', marginBottom: 16 }}>
                                    <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }]}>
                                        Minute (5-min intervals)
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' }}>
                                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => {
                                            const isSelected = selectedMinute === m;
                                            return (
                                                <TouchableOpacity
                                                    key={m}
                                                    onPress={() => setSelectedMinute(m)}
                                                    activeOpacity={0.7}
                                                    style={{
                                                        width: '23%',
                                                        height: 32,
                                                        borderRadius: 10,
                                                        backgroundColor: isSelected ? colors.primary : colors.cardFill,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderWidth: 1,
                                                        borderColor: isSelected ? colors.primary : colors.stroke,
                                                    }}
                                                >
                                                    <Text style={[textStyles.body, { color: isSelected ? colors.onPrimary : colors.text, fontSize: 12, fontWeight: isSelected ? '700' : '600' }]}>
                                                        :{String(m).padStart(2, '0')}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>

                                {/* Action buttons */}
                                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderWidth: 1,
                                            borderColor: colors.stroke,
                                            backgroundColor: colors.cardFill,
                                        }}
                                        onPress={() => setView('schedule')}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.btnLabel, { color: colors.text, fontSize: 14 }]}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{
                                            flex: 1,
                                            paddingVertical: 12,
                                            borderRadius: 14,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: colors.primary,
                                        }}
                                        onPress={() => {
                                            const candidateTime = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')} ${selectedAmPm}`;
                                            if (activeTimeIdx !== null) {
                                                const isDuplicate = tempTimes.some((t, i) => i !== activeTimeIdx && t.trim().toUpperCase() === candidateTime);
                                                if (isDuplicate) {
                                                    showSnackbar(`"${candidateTime}" is already assigned to another dispense time.`, 'error');
                                                    return;
                                                }
                                                const updated = [...tempTimes];
                                                updated[activeTimeIdx] = candidateTime;
                                                setTempTimes(updated);
                                            }
                                            setView('schedule');
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[textStyles.btnLabel, { color: colors.onPrimary, fontSize: 14, fontWeight: '700' }]}>Set Time</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </KeyboardAvoidingView>
        </Modal>
    );
}

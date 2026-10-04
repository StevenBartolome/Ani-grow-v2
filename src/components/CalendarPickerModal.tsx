import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';

export interface CalendarPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (dateStr: string) => void; // YYYY-MM-DD
    title: string;
    selectedDate?: string; // YYYY-MM-DD
    minDate?: string;       // YYYY-MM-DD, inclusive
    maxDate?: string;       // YYYY-MM-DD, inclusive
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAY_LABELS = ['S','M','T','W','T','F','S'];

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
function toDateStr(y: number, m: number, d: number): string { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }

export function CalendarPickerModal({ visible, onClose, onSelect, title, selectedDate, minDate, maxDate }: CalendarPickerModalProps) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    const parseYM = (dateStr?: string) => {
        if (dateStr) {
            const [y, m] = dateStr.split('-').map(Number);
            if (!isNaN(y) && !isNaN(m)) {
                return { year: y, month: m - 1 };
            }
        }
        const today = new Date();
        return { year: today.getFullYear(), month: today.getMonth() };
    };

    const todayDate = new Date();
    const todayStr = toDateStr(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());

    const [viewYear, setViewYear] = useState(() => parseYM(selectedDate).year);
    const [viewMonth, setViewMonth] = useState(() => parseYM(selectedDate).month);

    useEffect(() => {
        if (visible) {
            const { year, month } = parseYM(selectedDate);
            setViewYear(year);
            setViewMonth(month);
        }
    }, [visible, selectedDate]);

    const goPrevMonth = () => {
        if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
        else setViewMonth(m => m - 1);
    };
    const goNextMonth = () => {
        if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
        else setViewMonth(m => m + 1);
    };

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
                <TouchableOpacity
                    activeOpacity={1}
                    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    onPress={onClose}
                />
                <View
                    style={{
                        backgroundColor: colors.surface,
                        width: '100%',
                        maxWidth: 340,
                        padding: 20,
                        borderRadius: 24,
                        elevation: 10,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.15,
                        shadowRadius: 12,
                    }}
                >
                    <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 4, fontSize: 17 }]}>
                        {title}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8 }}>
                        <TouchableOpacity onPress={goPrevMonth} style={{ padding: 8, borderRadius: 20, backgroundColor: colors.cardFill }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <MaterialIcons name="chevron-left" size={22} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 15 }]}>
                            {MONTH_NAMES[viewMonth]} {viewYear}
                        </Text>
                        <TouchableOpacity onPress={goNextMonth} style={{ padding: 8, borderRadius: 20, backgroundColor: colors.cardFill }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <MaterialIcons name="chevron-right" size={22} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                        {WEEKDAY_LABELS.map((w, i) => (
                            <View key={i} style={{ flex: 1, alignItems: 'center', paddingVertical: 2 }}>
                                <Text style={[textStyles.label, { color: colors.textGrey, fontSize: 11 }]}>{w}</Text>
                            </View>
                        ))}
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        {cells.map((day, i) => {
                            if (day === null) return <View key={`blank-${i}`} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
                            const dateStr = toDateStr(viewYear, viewMonth, day);
                            const isSelected = dateStr === selectedDate;
                            const isToday = dateStr === todayStr;
                            const isDisabled = (minDate && dateStr < minDate) || (maxDate && dateStr > maxDate);
                            return (
                                <View key={dateStr} style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    <TouchableOpacity
                                        activeOpacity={isDisabled ? 1 : 0.7}
                                        disabled={!!isDisabled}
                                        onPress={() => { onSelect(dateStr); onClose(); }}
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            backgroundColor: isSelected ? colors.primary : isToday ? (colors.primary + '18') : 'transparent',
                                            borderWidth: isToday && !isSelected ? 1 : 0,
                                            borderColor: colors.primary,
                                        }}
                                    >
                                        <Text style={[textStyles.body, {
                                            fontSize: 13,
                                            fontFamily: isSelected || isToday ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                            color: isDisabled ? colors.textLight : isSelected ? colors.onPrimary : isToday ? colors.primary : colors.text,
                                        }]}>
                                            {day}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>

                    <TouchableOpacity
                        style={{ width: '100%', height: 42, borderRadius: 21, backgroundColor: colors.cardFill, alignItems: 'center', justifyContent: 'center', marginTop: 14 }}
                        onPress={onClose}
                        activeOpacity={0.7}
                    >
                        <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 13 }]}>Cancel</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

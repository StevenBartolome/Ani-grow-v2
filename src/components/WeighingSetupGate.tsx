import React from 'react';
import { View, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { Text } from '@/components/Text';
import { MaterialIcons } from '@expo/vector-icons';
import { AnimalTypePillSwitcher } from '@/components/AnimalTypePillSwitcher';
import { SelectionModal } from '@/components/SelectionModal';
import { useTheme } from '@/context/ThemeContext';
import { useTextStyles } from '@/constants/textStyles';
import { useAniWeighStyles } from '@/styles/aniweighStyles';

export interface WeighingSetupGateProps {
    gateAnimalType: 'pig' | 'piglet' | 'chicken' | 'chicks';
    setGateAnimalType: (type: 'pig' | 'piglet' | 'chicken' | 'chicks') => void;
    gateWeighMode: 'individual' | 'batch';
    setGateWeighMode: (mode: 'individual' | 'batch') => void;
    gateHousingId: string | null;
    setGateHousingId: (id: string | null) => void;
    gateBatchId: string | null;
    setGateBatchId: (id: string | null) => void;
    gateBatches: { id: string; name: string; current_count: number; arrival_date: string; age_at_arrival_days: number }[];
    setGateBatches: (batches: any[]) => void;
    farmHousings: { id: string; name: string; animal_type: string; farm_id?: string }[];
    chicksPerTray: number;
    isBeginningSession: boolean;
    onBeginWeighingSession: () => void;
    gateHousingModalVisible: boolean;
    setGateHousingModalVisible: (visible: boolean) => void;
    gateBatchModalVisible: boolean;
    setGateBatchModalVisible: (visible: boolean) => void;
    renderFeedScheduleButton?: () => React.ReactNode;
    renderChicksPerTrayButton?: () => React.ReactNode;
    renderWeighingReminderCard?: () => React.ReactNode;
    onAnimalTypeChange?: (type: 'pig' | 'piglet' | 'chicken' | 'chicks') => void;
}

/**
 * Preserved pre-weighing setup gate component.
 * Allows confirming Animal Type, House, and Batch before starting a run.
 */
export const WeighingSetupGate: React.FC<WeighingSetupGateProps> = ({
    gateAnimalType,
    setGateAnimalType,
    gateWeighMode,
    setGateWeighMode,
    gateHousingId,
    setGateHousingId,
    gateBatchId,
    setGateBatchId,
    gateBatches,
    farmHousings,
    chicksPerTray,
    isBeginningSession,
    onBeginWeighingSession,
    gateHousingModalVisible,
    setGateHousingModalVisible,
    gateBatchModalVisible,
    setGateBatchModalVisible,
    renderFeedScheduleButton,
    renderChicksPerTrayButton,
    renderWeighingReminderCard,
    onAnimalTypeChange,
}) => {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const aniweighStyles = useAniWeighStyles();

    return (
        <ScrollView contentContainerStyle={aniweighStyles.contentContainer} showsVerticalScrollIndicator={false}>
            <View style={{ paddingTop: 10, paddingBottom: 40 }}>
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                    <MaterialIcons name="fact-check" size={32} color={colors.primary} />
                    <Text style={[textStyles.h2, { color: colors.text, marginTop: 8, textAlign: 'center', fontSize: 20 }]}>
                        Set Up This Weighing Run
                    </Text>
                    <Text style={[textStyles.body, { color: colors.textGrey, marginTop: 4, textAlign: 'center', paddingHorizontal: 20, fontSize: 13 }]}>
                        Confirm what's being weighed before the scale unlocks.
                    </Text>
                </View>

                <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>Animal Type</Text>
                <AnimalTypePillSwitcher
                    selected={gateAnimalType}
                    options={[
                        { key: 'pig', label: 'Pig' },
                        { key: 'piglet', label: 'Piglet' },
                        { key: 'chicken', label: 'Chicken' },
                        { key: 'chicks', label: 'Chicks' },
                    ]}
                    onSelect={(type) => {
                        if (gateAnimalType === type) return;
                        setGateAnimalType(type as any);
                        setGateHousingId(null);
                        setGateBatchId(null);
                        if (type === 'pig' || type === 'piglet') setGateWeighMode('individual');
                        else if (type === 'chicks') setGateWeighMode('batch');
                        else setGateWeighMode('individual');

                        if (onAnimalTypeChange) {
                            onAnimalTypeChange(type as any);
                        }
                    }}
                    style={{ marginBottom: 20 }}
                />

                {gateAnimalType === 'chicken' && (
                    <>
                        <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>Weighing Setup</Text>
                        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.stroke, padding: 4, marginBottom: 20 }}>
                            {([
                                { key: 'individual' as const, label: 'Individual' },
                                { key: 'batch' as const, label: 'By Tray / Crate' },
                            ]).map(opt => {
                                const isSelected = gateWeighMode === opt.key;
                                return (
                                    <TouchableOpacity
                                        key={opt.key}
                                        onPress={() => setGateWeighMode(opt.key)}
                                        activeOpacity={0.8}
                                        style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8, backgroundColor: isSelected ? colors.primary : 'transparent' }}
                                    >
                                        <Text style={[textStyles.h3, { color: isSelected ? colors.onPrimary : colors.textGrey, fontSize: 13, fontWeight: '700' }]}>
                                            {opt.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </>
                )}

                <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>House</Text>
                <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setGateHousingModalVisible(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 20 }}
                >
                    <Text style={[textStyles.body, { color: gateHousingId ? colors.text : colors.textGrey, flex: 1 }]}>
                        {farmHousings.find(h => h.id === gateHousingId)?.name ?? 'Select a house...'}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                </TouchableOpacity>

                <Text style={[textStyles.label, { color: colors.text, marginBottom: 8 }]}>Batch</Text>
                <TouchableOpacity
                    activeOpacity={gateHousingId ? 0.8 : 1}
                    disabled={!gateHousingId}
                    onPress={() => setGateBatchModalVisible(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8, opacity: gateHousingId ? 1 : 0.6 }}
                >
                    <Text style={[textStyles.body, { color: gateBatchId ? colors.text : colors.textGrey, flex: 1 }]}>
                        {gateBatches.find(b => b.id === gateBatchId)?.name ?? (gateHousingId ? 'Select a batch...' : 'Pick a house first')}
                    </Text>
                    <MaterialIcons name="arrow-drop-down" size={20} color={colors.textGrey} />
                </TouchableOpacity>
                {gateBatchId && (
                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 12, marginBottom: 20 }]}>
                        {gateAnimalType === 'chicks' || (gateAnimalType === 'chicken' && gateWeighMode === 'batch')
                            ? `Expected: ${gateBatches.find(b => b.id === gateBatchId)?.current_count ?? 0} chicks · ${chicksPerTray} chicks/tray · ${Math.ceil((gateBatches.find(b => b.id === gateBatchId)?.current_count ?? 0) / chicksPerTray)} required tray weighs`
                            : `Expected: ${gateBatches.find(b => b.id === gateBatchId)?.current_count ?? 0} ${gateAnimalType === 'pig' ? 'pigs' : 'chickens'}`}
                    </Text>
                )}

                <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={!gateHousingId || !gateBatchId || isBeginningSession}
                    onPress={onBeginWeighingSession}
                    style={{
                        height: 52,
                        borderRadius: 26,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: 12,
                        opacity: (!gateHousingId || !gateBatchId || isBeginningSession) ? 0.5 : 1,
                    }}
                >
                    {isBeginningSession ? (
                        <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                        <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 15 }]}>
                            Begin Weighing
                        </Text>
                    )}
                </TouchableOpacity>

                {/* Optional Controls on Pre-gate view */}
                <View style={{ marginTop: 12 }}>
                    {renderFeedScheduleButton && renderFeedScheduleButton()}
                    {renderChicksPerTrayButton && renderChicksPerTrayButton()}
                    {renderWeighingReminderCard && renderWeighingReminderCard()}
                </View>
            </View>

            <SelectionModal
                visible={gateHousingModalVisible}
                onClose={() => setGateHousingModalVisible(false)}
                onSelect={(val) => {
                    const isPigKind = gateAnimalType === 'pig' || gateAnimalType === 'piglet';
                    const targetType = isPigKind ? 'pig' : 'chicken';
                    const matched = farmHousings.find(h => (h.animal_type === targetType || h.animal_type === gateAnimalType) && h.name === val);
                    if (matched) {
                        if (matched.id !== gateHousingId) {
                            setGateBatchId(null);
                        }
                        setGateHousingId(matched.id);
                    }
                    setGateHousingModalVisible(false);
                }}
                title="Select House"
                description="Which house is being weighed?"
                icon="home"
                options={farmHousings.filter(h => {
                    const isPigKind = gateAnimalType === 'pig' || gateAnimalType === 'piglet';
                    const targetType = isPigKind ? 'pig' : 'chicken';
                    return h.animal_type === targetType || h.animal_type === gateAnimalType;
                }).map(h => h.name)}
                selectedValue={farmHousings.find(h => h.id === gateHousingId)?.name ?? ''}
                requireConfirm={false}
            />
            <SelectionModal
                visible={gateBatchModalVisible}
                onClose={() => setGateBatchModalVisible(false)}
                onSelect={(val) => {
                    const matched = gateBatches.find(b => b.name === val);
                    if (matched) setGateBatchId(matched.id);
                    setGateBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Which batch in this house is being weighed?"
                icon="layers"
                options={gateBatches.map(b => b.name)}
                selectedValue={gateBatches.find(b => b.id === gateBatchId)?.name ?? ''}
                requireConfirm={false}
            />
        </ScrollView>
    );
};

export default WeighingSetupGate;

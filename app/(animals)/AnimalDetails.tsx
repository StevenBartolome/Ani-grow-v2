import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimalIcon } from '@/components/AnimalIcon';

import ActionModal, { ActionModalType } from '@/components/ActionModal';
import { BackButton } from '@/components/BackButton';
import FloatingLabelInput from '@/components/FloatingLabelInput';
import { SelectionModal } from '@/components/SelectionModal';
import Snackbar, { SnackbarType } from '@/components/Snackbar';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnimalStyles } from '@/styles/animalStyles';

export default function AnimalDetailsScreen() {
    const { type } = useLocalSearchParams();
    const router = useRouter();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const styles = useAnimalStyles();

    // Default to 'Pigs' if none provided
    const animalType = typeof type === 'string' ? type : 'Pigs';
    const isPig = animalType === 'Pigs';

    // Mock Data
    const _projectedDate = "October 12, 2025";

    // Status Data
    const totalAnimals = isPig ? 150 : 320;
    const deceasedAnimals = isPig ? 2 : 5;

    const [selectedBatch, setSelectedBatch] = useState(isPig ? 'P-042 (Current)' : 'C-122 (Current)');
    const [batchModalVisible, setBatchModalVisible] = useState(false);

    // Generate an extended list of past and current batches
    const batches = isPig
        ? Array.from({ length: 15 }, (_, i) => `P-0${28 + i} (${i === 14 ? 'Current' : 'Finished'})`).reverse()
        : Array.from({ length: 15 }, (_, i) => `C-1${(i + 8 < 10 ? '0' : '') + (i + 8)} (${i === 14 ? 'Current' : 'Finished'})`).reverse();


    // State for assignments
    const [assignedHousing, setAssignedHousing] = useState(isPig ? 'Pig Housing 1' : 'Chicken Coop A');
    const [assignedFeeds, setAssignedFeeds] = useState(isPig ? 'Grower Pellets' : 'Starter Mash');

    // Modal State
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTarget, setEditTarget] = useState<'Housing' | 'Feeds'>('Housing');
    const [editValue, setEditValue] = useState('');

    // Add Heads Modal State
    const [addHeadsVisible, setAddHeadsVisible] = useState(false);
    const [addHeadsNumber, setAddHeadsNumber] = useState('');
    const [addHeadsAge, setAddHeadsAge] = useState('');

    // Deceased Modal State
    const [deceasedVisible, setDeceasedVisible] = useState(false);
    const [deceasedNumber, setDeceasedNumber] = useState('');
    const [deceasedReason, setDeceasedReason] = useState('Illness');
    const [deceasedOtherReason, setDeceasedOtherReason] = useState('');
    const [deceasedReasonModalVisible, setDeceasedReasonModalVisible] = useState(false);

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    // Confirm Modal State
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [confirmModalType, setConfirmModalType] = useState<ActionModalType>('confirmation');
    const [confirmModalTitle, setConfirmModalTitle] = useState('');
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [confirmActionType, setConfirmActionType] = useState<'addHeads' | 'deceased' | 'addBatch' | null>(null);

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const handleAddHeadsClick = () => {
        if (!addHeadsNumber || !addHeadsAge) {
            showSnackbar('Please fill in all fields.', 'error');
            return;
        }
        setAddHeadsVisible(false);
        setConfirmActionType('addHeads');
        setConfirmModalType('confirmation');
        setConfirmModalTitle('Confirm Addition');
        setConfirmModalMessage(`Are you sure you want to add ${addHeadsNumber} heads to the batch?`);
        setConfirmModalVisible(true);
    };

    const confirmAddHeads = () => {
        setConfirmModalVisible(false);
        showSnackbar(`Successfully added ${addHeadsNumber} heads.`);
        setAddHeadsNumber('');
        setAddHeadsAge('');
    };

    const handleDeceasedClick = () => {
        if (!deceasedNumber) {
            showSnackbar('Please enter the number of deceased.', 'error');
            return;
        }
        if (deceasedReason === 'Other' && !deceasedOtherReason) {
            showSnackbar('Please specify the reason.', 'error');
            return;
        }
        setDeceasedVisible(false);
        setConfirmActionType('deceased');
        setConfirmModalType('warning');
        setConfirmModalTitle('Record Deceased?');
        setConfirmModalMessage(`Are you sure you want to record ${deceasedNumber} deceased animals?`);
        setConfirmModalVisible(true);
    };

    const confirmDeceased = () => {
        setConfirmModalVisible(false);
        showSnackbar(`Successfully recorded ${deceasedNumber} deceased.`);
        setDeceasedNumber('');
        setDeceasedReason('Illness');
        setDeceasedOtherReason('');
    };

    const handleAddBatchClick = () => {
        setConfirmActionType('addBatch');
        setConfirmModalType('confirmation');
        setConfirmModalTitle('Create New Batch?');
        setConfirmModalMessage(`Are you sure you want to create a new batch for ${animalType}?`);
        setConfirmModalVisible(true);
    };

    const confirmAddBatch = () => {
        setConfirmModalVisible(false);
        showSnackbar(`Successfully created a new batch.`);
    };

    const handleConfirmAction = () => {
        if (confirmActionType === 'addHeads') {
            confirmAddHeads();
        } else if (confirmActionType === 'deceased') {
            confirmDeceased();
        } else if (confirmActionType === 'addBatch') {
            confirmAddBatch();
        }
    };


    const handleSelectBatch = (batch: string) => {
        setSelectedBatch(batch);
        setBatchModalVisible(false);
    };

    const getEditOptions = () => {
        if (editTarget === 'Housing') return isPig ? ['Pig Housing 1', 'Pig Housing 2', 'Pig Housing 3', 'Pig Housing 4', 'Pig Housing 5', 'Pig Housing 6', 'Pig Housing 7', 'Pig Housing 8', 'Isolation Pen'] : ['Chicken Coop A', 'Chicken Coop B', 'Chicken Coop C', 'Chicken Coop D', 'Chicken Coop E', 'Chicken Coop F', 'Chicken Coop G', 'Brooder', 'Isolation Coop'];
        if (editTarget === 'Feeds') return ['Starter Mash', 'Grower Pellets', 'Finisher Pellets', 'Premium Mix', 'Organic Mix', 'Custom Mix A', 'Custom Mix B'];
        return [];
    };

    const openEditModal = (target: 'Housing' | 'Feeds', currentValue: string) => {
        setEditTarget(target);
        setEditValue(currentValue);
        setEditModalVisible(true);
    };

    const handleEditConfirm = (val: string) => {
        if (editTarget === 'Housing') setAssignedHousing(val);
        if (editTarget === 'Feeds') setAssignedFeeds(val);
        setEditModalVisible(false);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Header matches AddDeviceScreen */}
            <View style={styles.headerTopRow}>
                <View style={{ width: 44, height: 44 }}>
                    <BackButton onPress={() => router.back()} />
                </View>
                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18 }]}>
                    Your {animalType}
                </Text>
                <View style={{ width: 44, height: 44 }} />
            </View>

            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: 8 }]} showsVerticalScrollIndicator={false}>

                {/* Intro Text */}
                <Text style={[textStyles.body, styles.detailsSubtitle, { color: colors.textGrey, marginTop: 4, marginBottom: 16 }]}>
                    Here are the current information on your {animalType.toLowerCase()} housing, batch statistics, and the insights.
                </Text>

                {/* Check Growth Button (Moved to top) */}
                <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.primaryButton, { backgroundColor: colors.primary, marginBottom: 20, flexDirection: 'row', justifyContent: 'center' }]}
                    onPress={() => {
                        // Navigate to Animal Growth Screen later
                    }}
                >
                    <MaterialIcons name="show-chart" size={24} color={colors.onPrimary} style={{ marginRight: 8 }} />
                    <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>Growth</Text>
                </TouchableOpacity>

                {/* Batch Selection */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={[textStyles.label, styles.dropdownLabel, { color: colors.text, marginBottom: 0 }]}>
                        Select a batch no.
                    </Text>
                    <TouchableOpacity onPress={handleAddBatchClick} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                        <Text style={[textStyles.label, { color: colors.primary }]}>New Batch</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    activeOpacity={0.8}
                    style={[
                        styles.dropdownContainer,
                        {
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            elevation: 1,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.5,
                            shadowRadius: 4,
                            marginBottom: 20,
                            paddingVertical: 14,
                        }
                    ]}
                    onPress={() => setBatchModalVisible(true)}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <MaterialIcons name="layers" size={20} color={colors.textGrey} style={{ marginRight: 12 }} />
                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>{selectedBatch}</Text>
                    </View>
                    <MaterialIcons name={"arrow-drop-down"} size={24} color={colors.textGrey} />
                </TouchableOpacity>

                {/* Batch Stats List */}
                <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>Batch Statistics</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                    <StatusCard title="Total Heads" value={totalAnimals.toString()} icon={isPig ? 'pig' : 'chicken'} isCustomIcon bgColor={(isPig ? colors.pig : colors.chicken) + '1A'} iconColor={isPig ? colors.pig : colors.chicken} />
                    <StatusCard title="Deceased" value={deceasedAnimals.toString()} icon="warning" bgColor={colors.error + '1A'} iconColor={colors.error} />
                </View>

                {/* Batch Quick Actions */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                    <TouchableOpacity
                        style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 }}
                        onPress={() => setAddHeadsVisible(true)}
                    >
                        <MaterialIcons name="add" size={20} color={colors.primary} style={{ marginRight: 6 }} />
                        <Text style={[textStyles.h3, { color: colors.primary, fontSize: 13 }]}>Add Heads</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2 }}
                        onPress={() => setDeceasedVisible(true)}
                    >
                        <MaterialIcons name="warning" size={18} color={colors.error} style={{ marginRight: 6 }} />
                        <Text style={[textStyles.h3, { color: colors.error, fontSize: 13 }]}>Deceased</Text>
                    </TouchableOpacity>
                </View>

                {/* Housing and Feeds Editable Sections */}
                <Text style={[textStyles.h2, { color: colors.text, marginBottom: 8 }]}>Management</Text>

                <HorizontalActionCard
                    title="Assigned Housing"
                    value={assignedHousing}
                    icon="home"
                    onEdit={() => openEditModal('Housing', assignedHousing)}
                />

                <HorizontalActionCard
                    title="Assigned Feeds"
                    value={assignedFeeds}
                    icon="grain"
                    onEdit={() => openEditModal('Feeds', assignedFeeds)}
                />
                <View style={{ height: 12 }} />

                {/* AniBot Insight Card */}
                <LinearGradient
                    colors={[colors.primary, '#43A047']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.insightCard, { marginBottom: 24 }]}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                        <View style={styles.insightIconBox}>
                            <MaterialIcons name="auto-awesome" size={20} color="#FFF" />
                        </View>
                        <Text style={[textStyles.h3, { color: '#FFF', marginLeft: 12 }]}>AniBot Insight</Text>
                    </View>

                    <Text style={[textStyles.body, { color: 'rgba(255, 255, 255, 0.9)', marginBottom: 8 }]}>
                        Based on the current growth rates, the projected market target date for this batch is:
                    </Text>
                    <Text style={[textStyles.h2, { color: '#FFF', fontSize: 24, fontFamily: 'Poppins-Bold' }]}>
                        {_projectedDate}
                    </Text>
                </LinearGradient>
            </ScrollView>

            {/* Edit Field Modal - Housing & Feeds */}
            <SelectionModal
                visible={editModalVisible}
                onClose={() => setEditModalVisible(false)}
                onSelect={(val) => handleEditConfirm(val)}
                title={`Edit ${editTarget}`}
                description={`Select a new value for ${editTarget}.`}
                icon="edit"
                options={getEditOptions()}
                selectedValue={editTarget === 'Housing' ? assignedHousing : assignedFeeds}
                enableSearch
            />

            {/* Batch Selection Modal */}
            <SelectionModal
                visible={batchModalVisible}
                onClose={() => setBatchModalVisible(false)}
                onSelect={(batch) => handleSelectBatch(batch)}
                title="Select Batch"
                description="Choose an active or finished batch."
                icon="layers"
                options={batches}
                selectedValue={selectedBatch}
                enableSearch
                requireConfirm={false}
            />

            {/* Add Heads Modal */}
            <Modal visible={addHeadsVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>

                        <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                            <MaterialIcons name="add" size={32} color={colors.primary} />
                        </View>

                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Add Heads</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>Enter the number of new animals and their default age.</Text>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Number of Heads"
                                icon={isPig ? 'pig' : 'chicken'}
                                value={addHeadsNumber}
                                onChangeText={(text) => setAddHeadsNumber(text.replace(/[^0-9]/g, ''))}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>

                        <View style={{ width: '100%', marginBottom: 8 }}>
                            <FloatingLabelInput
                                label="Age in Days"
                                icon="calendar-today"
                                value={addHeadsAge}
                                onChangeText={(text) => setAddHeadsAge(text.replace(/[^0-9]/g, ''))}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>

                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                onPress={() => setAddHeadsVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                onPress={handleAddHeadsClick}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Record Deceased Modal */}
            <Modal visible={deceasedVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>

                        <View style={{ backgroundColor: colors.error + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                            <MaterialIcons name="warning" size={32} color={colors.error} />
                        </View>

                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>Record Deceased</Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>Enter the number of deceased animals and the reason.</Text>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Number of Deceased"
                                icon={isPig ? 'pig' : 'chicken'}
                                value={deceasedNumber}
                                onChangeText={(text) => setDeceasedNumber(text.replace(/[^0-9]/g, ''))}
                                keyboardType="numeric"
                                backgroundColor={colors.surface}
                            />
                        </View>

                        <View style={{ width: '100%', marginBottom: 28 }}>
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
                                    backgroundColor: colors.surface
                                }}
                                onPress={() => setDeceasedReasonModalVisible(true)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <MaterialIcons name="help-outline" size={20} color={colors.icon} style={{ marginRight: 12 }} />
                                    <Text style={[textStyles.body, { color: colors.text }]}>{deceasedReason}</Text>
                                </View>
                                <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>

                        {deceasedReason === 'Other' && (
                            <View style={{ width: '100%', marginBottom: 8 }}>
                                <FloatingLabelInput
                                    label="Specific Reason"
                                    icon="edit"
                                    value={deceasedOtherReason}
                                    onChangeText={setDeceasedOtherReason}
                                    backgroundColor={colors.surface}
                                />
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                onPress={() => setDeceasedVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.error, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                onPress={handleDeceasedClick}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: '#FFF', fontSize: 14 }]}>Record</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Deceased Reason Selection Modal */}
            <SelectionModal
                visible={deceasedReasonModalVisible}
                onClose={() => setDeceasedReasonModalVisible(false)}
                onSelect={(val) => {
                    setDeceasedReason(val);
                    setDeceasedReasonModalVisible(false);
                }}
                title="Select Reason"
                description="Choose the reason for the deceased animals."
                icon="help-outline"
                options={['Illness', 'Injury', 'Predator', 'Unknown', 'Other']}
                selectedValue={deceasedReason}
                enableSearch={false}
                requireConfirm={false}
            />

            {/* Confirmation Modal */}
            <ActionModal
                visible={confirmModalVisible}
                type={confirmModalType}
                title={confirmModalTitle}
                message={confirmModalMessage}
                confirmText={confirmActionType === 'deceased' ? 'Record' : 'Add'}
                cancelText="Cancel"
                onConfirm={handleConfirmAction}
                onCancel={() => setConfirmModalVisible(false)}
            />

            {/* Snackbar Overlay */}
            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

// Child StatusCard Component specifically crafted for Statistics Board
function StatusCard({ title, value, icon, bgColor, iconColor, isCustomIcon }: any) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnimalStyles();

    return (
        <View style={[styles.statusCard, { flex: 1, minWidth: '45%', flexDirection: 'column', alignItems: 'flex-start' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 12 }}>
                <View style={[styles.statusIconBox, { backgroundColor: bgColor, width: 36, height: 36, marginRight: 8, borderRadius: 8 }]}>
                    {isCustomIcon ? (
                        <AnimalIcon type={icon} size={20} color={iconColor} />
                    ) : (
                        <MaterialIcons name={icon} size={20} color={iconColor} />
                    )}
                </View>
                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, flex: 1, flexWrap: 'wrap' }]} numberOfLines={1}>{title}</Text>
            </View>
            <Text style={[textStyles.h2, { color: colors.text, fontSize: 24 }]}>{value}</Text>
        </View>
    );
}

// New Horizontal Action Card Component
function HorizontalActionCard({ title, value, icon, onEdit }: any) {
    const { colors } = useTheme();
    const textStyles = useTextStyles();

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.stroke, elevation: 2, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 }}>
            <View style={{ backgroundColor: colors.primary + '1A', width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                <MaterialIcons name={icon} size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, marginBottom: 4 }]}>{title}</Text>
                <Text style={[textStyles.h3, { color: colors.text, fontSize: 16 }]}>{value}</Text>
            </View>
            <TouchableOpacity onPress={onEdit} style={{ padding: 8 }} activeOpacity={0.6}>
                <MaterialIcons name="edit" size={20} color={colors.textGrey} />
            </TouchableOpacity>
        </View>
    );
}

import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View, Modal } from 'react-native';
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
import { AnimalIcon } from '@/components/AnimalIcon';

// Mock Types
interface HousingItem {
    id: string;
    name: string;
    type: 'Pigs' | 'Chickens';
}

export default function ManageHousingsScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();
    const deviceStyles = useDevicesStyles();

    type FilterType = 'All' | 'Pigs' | 'Chickens';
    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const filters: FilterType[] = ['All', 'Pigs', 'Chickens'];

    const [housings, setHousings] = useState<HousingItem[]>([]);

    useEffect(() => {
        // Mock loading housings
        const mockHousings: HousingItem[] = [
            { id: '1', name: 'Pig Housing 1', type: 'Pigs' },
            { id: '2', name: 'Chicken Coop A', type: 'Chickens' },
            { id: '3', name: 'Pig Housing 2', type: 'Pigs' },
        ];
        setHousings(mockHousings);
    }, []);

    const filteredHousings = activeFilter === 'All' ? housings : housings.filter(h => h.type === activeFilter);

    // Modal state for Add/Edit
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingHousingId, setEditingHousingId] = useState<string | null>(null);
    const [tempHousingName, setTempHousingName] = useState('');
    const [tempHousingType, setTempHousingType] = useState('Pigs');
    const [housingTypeModalVisible, setHousingTypeModalVisible] = useState(false);

    // Confirmation Modal for Delete/Save
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [confirmModalType, setConfirmModalType] = useState<ActionModalType>('confirmation');
    const [confirmModalTitle, setConfirmModalTitle] = useState('');
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [confirmAction, setConfirmAction] = useState<'delete' | 'save' | null>(null);
    const [housingToDelete, setHousingToDelete] = useState<string | null>(null);

    // Snackbar State
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarType, setSnackbarType] = useState<SnackbarType>('success');

    const showSnackbar = (message: string, type: SnackbarType = 'success') => {
        setSnackbarMessage(message);
        setSnackbarType(type);
        setSnackbarVisible(true);
    };

    const openAddModal = () => {
        setEditingHousingId(null);
        setTempHousingName('');
        setTempHousingType('Pigs');
        setEditModalVisible(true);
    };

    const openEditModal = (id: string) => {
        const housing = housings.find(h => h.id === id);
        if (housing) {
            setEditingHousingId(id);
            setTempHousingName(housing.name);
            setTempHousingType(housing.type);
            setEditModalVisible(true);
        }
    };

    const confirmDelete = (id: string) => {
        const housing = housings.find(h => h.id === id);
        if (housing) {
            setHousingToDelete(id);
            setConfirmAction('delete');
            setConfirmModalType('warning');
            setConfirmModalTitle('Delete Housing?');
            setConfirmModalMessage(`Are you sure you want to delete "${housing.name}"?`);
            setConfirmModalVisible(true);
        }
    };

    const handleSaveClick = () => {
        if (!tempHousingName.trim()) {
            showSnackbar('Please enter a housing name.', 'error');
            return;
        }
        setEditModalVisible(false);
        setConfirmAction('save');
        setConfirmModalType('confirmation');
        setConfirmModalTitle(editingHousingId ? 'Update Housing?' : 'Add Housing?');
        setConfirmModalMessage(`Are you sure you want to ${editingHousingId ? 'update this' : 'add a new'} housing?`);
        setConfirmModalVisible(true);
    };

    const executeAction = async () => {
        if (confirmAction === 'delete' && housingToDelete) {
            try {
                // Mock delete
                setHousings(prev => prev.filter(h => h.id !== housingToDelete));
                showSnackbar('Housing deleted successfully.', 'success');
            } catch (e) {
                showSnackbar('Failed to delete housing.', 'error');
            }
        } else if (confirmAction === 'save') {
            try {
                const hId = editingHousingId || Date.now().toString();
                const newHousing: HousingItem = {
                    id: hId,
                    name: tempHousingName,
                    type: tempHousingType as 'Pigs' | 'Chickens'
                };
                
                // Mock save
                if (editingHousingId) {
                    setHousings(prev => prev.map(h => h.id === editingHousingId ? newHousing : h));
                } else {
                    setHousings(prev => [...prev, newHousing]);
                }
                
                showSnackbar(editingHousingId ? 'Housing updated successfully.' : 'New housing added successfully.', 'success');
            } catch (e) {
                showSnackbar('Failed to save housing.', 'error');
            }
        }
        setConfirmModalVisible(false);
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton onPress={() => router.back()} />
                    </View>
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        Manage Housings
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: -8 }}>
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Registered Housings</Text>
                            <TouchableOpacity onPress={openAddModal} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                                <Text style={[textStyles.label, { color: colors.primary }]}>Add New</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.sectionDescription}>List of all physical housings for your livestock.</Text>

                        <View style={[deviceStyles.filterContainer, { marginTop: 12, marginBottom: 16, paddingHorizontal: 0 }]}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {filters.map(filter => (
                                    <TouchableOpacity
                                        key={filter}
                                        activeOpacity={0.7}
                                        onPress={() => setActiveFilter(filter)}
                                        style={[
                                            deviceStyles.filterChip,
                                            activeFilter === filter && deviceStyles.filterChipActive
                                        ]}
                                    >
                                        <Text style={[
                                            deviceStyles.filterChipText,
                                            activeFilter === filter && deviceStyles.filterChipTextActive
                                        ]}>
                                            {filter}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        <View style={[styles.card, { paddingVertical: 8 }]}>
                            {filteredHousings.map((housing, index) => (
                                <View key={housing.id} style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 12,
                                    paddingHorizontal: 16,
                                    borderBottomWidth: index < filteredHousings.length - 1 ? 1 : 0,
                                    borderBottomColor: colors.stroke
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                            <MaterialIcons name="home" size={20} color={colors.primary} />
                                        </View>
                                        <View>
                                            <Text style={[textStyles.h3, { color: colors.text }]}>{housing.name}</Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>{housing.type}</Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <TouchableOpacity onPress={() => openEditModal(housing.id)}>
                                            <MaterialIcons name="edit" size={22} color={colors.textGrey} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => confirmDelete(housing.id)}>
                                            <MaterialIcons name="delete-outline" size={22} color={colors.error} />
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </ScrollView>
            </View>

            {/* Add / Edit Modal */}
            <Modal visible={editModalVisible} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: colors.surface, width: '100%', maxWidth: 340, padding: 24, borderRadius: 24, alignItems: 'center' }}>
                        <View style={{ backgroundColor: colors.primary + '1A', padding: 16, borderRadius: 24, marginBottom: 16 }}>
                            <MaterialIcons name={editingHousingId ? "edit" : "add-home"} size={32} color={colors.primary} />
                        </View>
                        
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>
                            {editingHousingId ? 'Edit Housing' : 'Add Housing'}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Enter the details for this housing location.
                        </Text>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Housing Name"
                                icon="home"
                                value={tempHousingName}
                                onChangeText={setTempHousingName}
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
                                onPress={() => {
                                    setEditModalVisible(false);
                                    setHousingTypeModalVisible(true);
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <AnimalIcon type={tempHousingType as any} size={20} color={colors.icon} style={{ marginRight: 12 }} />
                                    <Text style={[textStyles.body, { color: colors.text }]}>{tempHousingType}</Text>
                                </View>
                                <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                            </TouchableOpacity>
                        </View>

                        <View style={{ flexDirection: 'row', width: '100%', gap: 12 }}>
                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.cardFill, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                onPress={() => setEditModalVisible(false)}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.textGrey, fontSize: 14 }]}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={{ flex: 1, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 30, alignItems: 'center' }}
                                onPress={handleSaveClick}
                                activeOpacity={0.7}
                            >
                                <Text style={[textStyles.h3, { color: colors.onPrimary, fontSize: 14 }]}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Animal Type Selection Modal inside Add/Edit */}
            <SelectionModal
                visible={housingTypeModalVisible}
                onClose={() => {
                    setHousingTypeModalVisible(false);
                    setEditModalVisible(true);
                }}
                onSelect={(val) => {
                    setTempHousingType(val);
                    setHousingTypeModalVisible(false);
                    setEditModalVisible(true);
                }}
                title="Animal Type"
                description="Select the type of animal for this housing."
                icon={tempHousingType === 'Pigs' ? 'pig' : 'chicken'}
                isCustomIcon
                options={['Pigs', 'Chickens']}
                selectedValue={tempHousingType}
                requireConfirm={false}
                enableSearch={false}
            />

            <ActionModal
                visible={confirmModalVisible}
                type={confirmModalType}
                title={confirmModalTitle}
                message={confirmModalMessage}
                confirmText={confirmAction === 'delete' ? 'Delete' : 'Confirm'}
                cancelText="Cancel"
                onConfirm={executeAction}
                onCancel={() => setConfirmModalVisible(false)}
            />

            <Snackbar
                visible={snackbarVisible}
                message={snackbarMessage}
                type={snackbarType}
                onDismiss={() => setSnackbarVisible(false)}
            />
        </SafeAreaView>
    );
}

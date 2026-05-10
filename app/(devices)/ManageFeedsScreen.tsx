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
interface FeedItem {
    id: string;
    name: string;
    supplier: string;
    category: string;
    type: 'Pigs' | 'Chickens';
}

export default function ManageFeedsScreen() {
    const styles = useSettingsSubPageStyles();
    const textStyles = useTextStyles();
    const { colors } = useTheme();
    const router = useRouter();
    const deviceStyles = useDevicesStyles();

    type FilterType = 'All' | 'Pigs' | 'Chickens';
    const [activeFilter, setActiveFilter] = useState<FilterType>('All');
    const filters: FilterType[] = ['All', 'Pigs', 'Chickens'];

    const [feeds, setFeeds] = useState<FeedItem[]>([]);

    useEffect(() => {
        // Mock loading feeds
        const mockFeeds: FeedItem[] = [
            { id: '1', name: 'Premium Grower', supplier: 'AgriCorp', category: 'Grower', type: 'Pigs' },
            { id: '2', name: 'Starter Mash', supplier: 'FeedMaster', category: 'Starter', type: 'Chickens' },
            { id: '3', name: 'Finisher Pellets', supplier: 'AgriCorp', category: 'Finisher', type: 'Pigs' },
        ];
        setFeeds(mockFeeds);
    }, []);

    const filteredFeeds = activeFilter === 'All' ? feeds : feeds.filter(f => f.type === activeFilter);

    // Modal state for Add/Edit
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
    const [tempFeedName, setTempFeedName] = useState('');
    const [tempFeedSupplier, setTempFeedSupplier] = useState('');
    const [tempFeedCategory, setTempFeedCategory] = useState('');
    const [tempFeedType, setTempFeedType] = useState('Pigs');
    const [feedTypeModalVisible, setFeedTypeModalVisible] = useState(false);

    // Confirmation Modal for Delete/Save
    const [confirmModalVisible, setConfirmModalVisible] = useState(false);
    const [confirmModalType, setConfirmModalType] = useState<ActionModalType>('confirmation');
    const [confirmModalTitle, setConfirmModalTitle] = useState('');
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [confirmAction, setConfirmAction] = useState<'delete' | 'save' | null>(null);
    const [feedToDelete, setFeedToDelete] = useState<string | null>(null);

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
        setEditingFeedId(null);
        setTempFeedName('');
        setTempFeedSupplier('');
        setTempFeedCategory('');
        setTempFeedType('Pigs');
        setEditModalVisible(true);
    };

    const openEditModal = (id: string) => {
        const feed = feeds.find(f => f.id === id);
        if (feed) {
            setEditingFeedId(id);
            setTempFeedName(feed.name);
            setTempFeedSupplier(feed.supplier);
            setTempFeedCategory(feed.category || '');
            setTempFeedType(feed.type);
            setEditModalVisible(true);
        }
    };

    const confirmDelete = (id: string) => {
        const feed = feeds.find(f => f.id === id);
        if (feed) {
            setFeedToDelete(id);
            setConfirmAction('delete');
            setConfirmModalType('warning');
            setConfirmModalTitle('Delete Feed?');
            setConfirmModalMessage(`Are you sure you want to delete "${feed.name}"?`);
            setConfirmModalVisible(true);
        }
    };

    const handleSaveClick = () => {
        if (!tempFeedName.trim()) {
            showSnackbar('Please enter a feed name.', 'error');
            return;
        }
        setEditModalVisible(false);
        setConfirmAction('save');
        setConfirmModalType('confirmation');
        setConfirmModalTitle(editingFeedId ? 'Update Feed?' : 'Add Feed?');
        setConfirmModalMessage(`Are you sure you want to ${editingFeedId ? 'update this' : 'add a new'} feed?`);
        setConfirmModalVisible(true);
    };

    const executeAction = async () => {
        if (confirmAction === 'delete' && feedToDelete) {
            try {
                // Mock delete
                setFeeds(prev => prev.filter(f => f.id !== feedToDelete));
                showSnackbar('Feed deleted successfully.', 'success');
            } catch (e) {
                showSnackbar('Failed to delete feed.', 'error');
            }
        } else if (confirmAction === 'save') {
            try {
                const feedId = editingFeedId || Date.now().toString();
                const newFeed: FeedItem = {
                    id: feedId,
                    name: tempFeedName,
                    supplier: tempFeedSupplier || 'Unknown',
                    category: tempFeedCategory || 'Uncategorized',
                    type: tempFeedType as 'Pigs' | 'Chickens'
                };
                
                // Mock save
                if (editingFeedId) {
                    setFeeds(prev => prev.map(f => f.id === editingFeedId ? newFeed : f));
                } else {
                    setFeeds(prev => [...prev, newFeed]);
                }
                
                showSnackbar(editingFeedId ? 'Feed updated successfully.' : 'New feed added successfully.', 'success');
            } catch (e) {
                showSnackbar('Failed to save feed.', 'error');
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
                        Manage Feeds
                    </Text>
                    <View style={{ width: 44, height: 44 }} />
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: -8 }}>
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Available Feeds</Text>
                            <TouchableOpacity onPress={openAddModal} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <MaterialIcons name="add-circle-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                                <Text style={[textStyles.label, { color: colors.primary }]}>Add New</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.sectionDescription}>List of all feed options available for your livestock.</Text>

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
                            {filteredFeeds.map((feed, index) => (
                                <View key={feed.id} style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 12,
                                    paddingHorizontal: 16,
                                    borderBottomWidth: index < filteredFeeds.length - 1 ? 1 : 0,
                                    borderBottomColor: colors.stroke
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary + '1A', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                            <MaterialIcons name="restaurant-menu" size={20} color={colors.primary} />
                                        </View>
                                        <View>
                                            <Text style={[textStyles.h3, { color: colors.text }]}>{feed.name}</Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>{feed.type} • {feed.category} • {feed.supplier}</Text>
                                        </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <TouchableOpacity onPress={() => openEditModal(feed.id)}>
                                            <MaterialIcons name="edit" size={22} color={colors.textGrey} />
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => confirmDelete(feed.id)}>
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
                            <MaterialIcons name={editingFeedId ? "edit" : "restaurant"} size={32} color={colors.primary} />
                        </View>
                        
                        <Text style={[textStyles.h2, { color: colors.text, textAlign: 'center', marginBottom: 8, fontSize: 20 }]}>
                            {editingFeedId ? 'Edit Feed' : 'Add Feed'}
                        </Text>
                        <Text style={[textStyles.body, { color: colors.textGrey, textAlign: 'center', marginBottom: 24 }]}>
                            Enter the details for this feed option.
                        </Text>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Feed Name"
                                icon="restaurant-menu"
                                value={tempFeedName}
                                onChangeText={setTempFeedName}
                                backgroundColor={colors.surface}
                            />
                        </View>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Supplier / Shop"
                                icon="store"
                                value={tempFeedSupplier}
                                onChangeText={setTempFeedSupplier}
                                backgroundColor={colors.surface}
                            />
                        </View>

                        <View style={{ width: '100%', marginBottom: 0 }}>
                            <FloatingLabelInput
                                label="Category (Starter, Grower, etc.)"
                                icon="category"
                                value={tempFeedCategory}
                                onChangeText={setTempFeedCategory}
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
                                    setFeedTypeModalVisible(true);
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <AnimalIcon type={tempFeedType as any} size={20} color={colors.icon} style={{ marginRight: 12 }} />
                                    <Text style={[textStyles.body, { color: colors.text }]}>{tempFeedType}</Text>
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
                visible={feedTypeModalVisible}
                onClose={() => {
                    setFeedTypeModalVisible(false);
                    setEditModalVisible(true);
                }}
                onSelect={(val) => {
                    setTempFeedType(val);
                    setFeedTypeModalVisible(false);
                    setEditModalVisible(true);
                }}
                title="Animal Type"
                description="Select the type of animal for this feed."
                icon={tempFeedType === 'Pigs' ? 'pig' : 'chicken'}
                isCustomIcon
                options={['Pigs', 'Chickens']}
                selectedValue={tempFeedType}
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

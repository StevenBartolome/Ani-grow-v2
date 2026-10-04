import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { WebView } from 'react-native-webview';

import { Text } from '@/components/Text';
import { BackButton } from '@/components/BackButton';
import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import {
    fetchManualCategories,
    fetchManualItems,
    openManualItem,
    downloadManualPdf,
    getViewerUrl,
    incrementManualViewCount,
    getItemTypeMeta,
    formatBytes,
    formatDuration,
    type ManualCategory,
    type ManualItem,
} from '@/lib/manualService';

/** Responsive horizontal padding matching Ani-Grow core screens */
const getHPad = (width: number) => {
    if (width >= 900) return Math.round(width * 0.12);
    if (width >= 600) return Math.round(width * 0.07);
    if (width <= 360) return 12;
    return 16;
};

export default function UserManualScreen() {
    const textStyles = useTextStyles();
    const insets = useSafeAreaInsets();
    const { colors, language } = useTheme();
    const { width: windowWidth } = useWindowDimensions();
    const isAndroid3ButtonNav = Platform.OS === 'android' && insets.bottom > 20;
    const isFilipino = language === 'fil';
    const hPad = getHPad(windowWidth);

    // Responsive breakpoints
    const isTabletOrWeb = windowWidth >= 768;
    const maxContentWidth = Math.min(windowWidth, 960);

    const [categories, setCategories] = useState<ManualCategory[]>([]);
    const [items, setItems] = useState<ManualItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [folderStack, setFolderStack] = useState<ManualCategory[]>([]);
    const [openingItemId, setOpeningItemId] = useState<string | null>(null);
    const [downloadingItemId, setDownloadingItemId] = useState<string | null>(null);
    const [activePdfViewerItem, setActivePdfViewerItem] = useState<ManualItem | null>(null);

    const currentFolder = folderStack.length > 0 ? folderStack[folderStack.length - 1] : null;

    const loadData = useCallback(async () => {
        try {
            const [cats, manualItems] = await Promise.all([
                fetchManualCategories(),
                fetchManualItems(),
            ]);
            setCategories(cats);
            setItems(manualItems);
        } catch (error) {
            console.error('[UserManualScreen] Error loading data:', error);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        loadData();
    };

    const handleOpenItem = async (item: ManualItem) => {
        try {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (_) {}

        setOpeningItemId(item.id);
        try {
            await openManualItem(item);
        } finally {
            setOpeningItemId(null);
        }
    };

    const handleViewPdf = (item: ManualItem) => {
        try {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (_) {}
        incrementManualViewCount(item).catch(() => {});
        setActivePdfViewerItem(item);
    };

    const handleDownloadPdf = async (item: ManualItem) => {
        try {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
        } catch (_) {}

        setDownloadingItemId(item.id);
        try {
            await downloadManualPdf(item, isFilipino);
        } finally {
            setDownloadingItemId(null);
        }
    };

    const handleEnterFolder = (folder: ManualCategory) => {
        try {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (_) {}
        setFolderStack((prev) => [...prev, folder]);
        setSearchQuery('');
    };

    const handleGoBackFolder = () => {
        try {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (_) {}
        setFolderStack((prev) => prev.slice(0, prev.length - 1));
        setSearchQuery('');
    };

    const handleJumpToFolderIndex = (index: number) => {
        try {
            if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        } catch (_) {}
        if (index < 0) {
            setFolderStack([]);
        } else {
            setFolderStack((prev) => prev.slice(0, index + 1));
        }
        setSearchQuery('');
    };

    // Subfolders of current folder (or root folders if at root)
    const currentSubfolders = useMemo(() => {
        if (!currentFolder) {
            return categories.filter((c) => !c.parent_id || c.parent_id.trim() === '');
        }
        const currentId = (currentFolder.id || '').trim().toLowerCase();
        return categories.filter(
            (c) => (c.parent_id || '').trim().toLowerCase() === currentId
        );
    }, [categories, currentFolder]);

    // Items inside current folder
    const currentFolderItems = useMemo(() => {
        if (!currentFolder) {
            return [];
        }
        const currentId = (currentFolder.id || '').trim().toLowerCase();
        return items.filter(
            (item) => (item.category_id || '').trim().toLowerCase() === currentId
        );
    }, [items, currentFolder]);

    // Helper counts for folders (recursively counts files across all subfolders)
    const getFolderCounts = useCallback(
        (folderId: string) => {
            const normFolderId = (folderId || '').trim().toLowerCase();

            // 1. Direct subfolders count
            const subCount = categories.filter(
                (c) => (c.parent_id || '').trim().toLowerCase() === normFolderId
            ).length;

            // 2. Collect folder ID and all its descendant subfolder IDs
            const descendantCatIds = new Set<string>();
            const collectDescendantIds = (catId: string) => {
                const nid = (catId || '').trim().toLowerCase();
                if (!nid || descendantCatIds.has(nid)) return;
                descendantCatIds.add(nid);

                categories
                    .filter((c) => (c.parent_id || '').trim().toLowerCase() === nid)
                    .forEach((child) => collectDescendantIds(child.id));
            };
            collectDescendantIds(folderId);

            // 3. Count all items belonging to this folder or any of its subfolders
            const itemCount = items.filter((item) =>
                descendantCatIds.has((item.category_id || '').trim().toLowerCase())
            ).length;

            return { subCount, itemCount };
        },
        [categories, items]
    );

    // Global search
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.toLowerCase().trim();
        return items.filter((item) => {
            const titleMatch = item.title?.toLowerCase().includes(q);
            const descMatch = item.description?.toLowerCase().includes(q);
            const catMatch = item.category?.name?.toLowerCase().includes(q);
            return titleMatch || descMatch || catMatch;
        });
    }, [items, searchQuery]);

    const isSearching = searchQuery.trim().length > 0;

    return (
        <View style={[styles.safeArea, { backgroundColor: colors.bgLight, paddingTop: insets.top, paddingBottom: isAndroid3ButtonNav ? insets.bottom : 0 }]}>
            <View style={styles.container}>
                {/* Header matching Notifications & Settings screens */}
                <View style={[styles.header, { paddingHorizontal: hPad }]}>
                    <View style={{ width: 44, height: 44 }}>
                        <BackButton
                            fallbackRoute="/(dashboard)/HomeScreen"
                            onPress={folderStack.length > 0 ? handleGoBackFolder : undefined}
                        />
                    </View>

                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, textAlign: 'center', flex: 1 }]}>
                        {isFilipino ? 'Gabay sa Paggamit' : 'User Manual'}
                    </Text>

                    <TouchableOpacity
                        style={[
                            styles.refreshRoundButton,
                            {
                                backgroundColor: colors.surface,
                                borderColor: colors.stroke,
                                shadowColor: colors.text,
                            },
                        ]}
                        onPress={handleRefresh}
                        disabled={isRefreshing}
                        activeOpacity={0.8}
                        accessibilityLabel="Refresh list"
                    >
                        {isRefreshing ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                            <MaterialIcons name="refresh" size={22} color={colors.text} />
                        )}
                    </TouchableOpacity>
                </View>

                {/* Breadcrumb Path Bar (when drilled down inside folders) */}
                {!isSearching && folderStack.length > 0 && (
                    <View style={[styles.breadcrumbBar, { backgroundColor: colors.surface, borderBottomColor: colors.stroke, paddingHorizontal: hPad }]}>
                        <View style={[styles.responsiveWrapper, { maxWidth: maxContentWidth }]}>
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.breadcrumbContent}
                            >
                                <TouchableOpacity
                                    style={styles.crumbSegment}
                                    onPress={() => handleJumpToFolderIndex(-1)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.crumbHomeIcon, { backgroundColor: colors.primary + '18' }]}>
                                        <MaterialIcons name="home" size={13} color={colors.primary} />
                                    </View>
                                    <Text style={[styles.crumbText, { color: colors.primary }]}>
                                        {isFilipino ? 'Lahat ng Folder' : 'All Folders'}
                                    </Text>
                                </TouchableOpacity>

                                {folderStack.map((folder, idx) => {
                                    const isLast = idx === folderStack.length - 1;
                                    return (
                                        <React.Fragment key={folder.id}>
                                            <MaterialIcons name="chevron-right" size={16} color={colors.textGrey} style={styles.crumbArrow} />
                                            <TouchableOpacity
                                                style={[
                                                    styles.crumbSegment,
                                                    isLast && [styles.activeCrumbSegment, { backgroundColor: colors.primary + '10' }],
                                                ]}
                                                onPress={() => handleJumpToFolderIndex(idx)}
                                                activeOpacity={0.7}
                                                disabled={isLast}
                                            >
                                                <MaterialIcons
                                                    name={isLast ? 'folder-open' : 'folder'}
                                                    size={14}
                                                    color={isLast ? colors.primary : colors.textGrey}
                                                />
                                                <Text
                                                    style={[
                                                        styles.crumbText,
                                                        {
                                                            color: isLast ? colors.primary : colors.text,
                                                            fontFamily: isLast ? 'Poppins-Bold' : 'Poppins-Medium',
                                                        },
                                                    ]}
                                                >
                                                    {folder.name}
                                                </Text>
                                            </TouchableOpacity>
                                        </React.Fragment>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                )}

                {/* Main Content Area */}
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={[textStyles.body, styles.loadingLabel, { color: colors.textGrey }]}>
                            {isFilipino ? 'Kinakarga...' : 'Loading resources...'}
                        </Text>
                    </View>
                ) : (
                    <ScrollView
                        style={styles.scrollArea}
                        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: hPad }]}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={isRefreshing}
                                onRefresh={handleRefresh}
                                colors={[colors.primary]}
                                tintColor={colors.primary}
                            />
                        }
                    >
                        <View style={[styles.responsiveWrapper, { maxWidth: maxContentWidth }]}>
                            {/* Branded Explanatory About Card matching Ani-Grow standards */}
                            {!isSearching && !currentFolder && (
                                <View style={[styles.aboutCardContainer, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                    <View style={[styles.aboutHeaderRow]}>
                                        <View style={[styles.aboutIconBox, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
                                            <MaterialIcons name="menu-book" size={22} color={colors.primary} />
                                        </View>
                                        <View style={styles.aboutHeaderTexts}>
                                            <Text style={[styles.aboutTitle, { color: colors.text }]}>
                                                {isFilipino ? 'Gabay sa Ani-Grow' : 'About Ani-Grow Manual'}
                                            </Text>
                                            <Text style={[styles.aboutSubtitle, { color: colors.primary }]}>
                                                {isFilipino ? 'Mga Dokumento at Video Walk-through' : 'Official Guides & Video Tutorials'}
                                            </Text>
                                        </View>
                                    </View>

                                    <Text style={[styles.aboutBodyText, { color: colors.textGrey }]}>
                                        {isFilipino
                                            ? 'Magbasa ng mga gabay o manood ng mga video walk-through upang matutunan kung paano gamitin at pamahalaan ang bawat bahagi ng Ani-Grow app.'
                                            : 'Read step-by-step guides or watch official video walk-throughs to easily navigate and operate all features of the Ani-Grow platform.'}
                                    </Text>
                                </View>
                            )}

                            {/* Active Folder Header Banner (when inside a folder) */}
                            {!isSearching && currentFolder && (
                                <View style={[styles.activeFolderCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                    <View style={[styles.activeFolderIconBox, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}>
                                        <MaterialIcons name="folder-open" size={24} color={colors.primary} />
                                    </View>
                                    <View style={styles.activeFolderTextCol}>
                                        <Text style={[styles.activeFolderTitle, { color: colors.text }]}>
                                            {currentFolder.name}
                                        </Text>
                                        {Boolean(currentFolder.description) && (
                                            <Text style={[styles.activeFolderDesc, { color: colors.textGrey }]}>
                                                {currentFolder.description}
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            )}

                            {/* Clean Floating Search Bar */}
                            <View style={[styles.searchBarContainer, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                <MaterialIcons name="search" size={20} color={colors.textGrey} style={styles.searchIcon} />
                                <TextInput
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                    placeholder={isFilipino ? 'Maghanap ng dokumento o video...' : 'Search manuals, guides, or video walk-throughs...'}
                                    placeholderTextColor={colors.textGrey}
                                    style={[styles.searchInput, { color: colors.text }]}
                                    returnKeyType="search"
                                    clearButtonMode="while-editing"
                                />
                                {Boolean(searchQuery) && (
                                    <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                        <MaterialIcons name="cancel" size={18} color={colors.textGrey} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* Search Results Mode */}
                            {isSearching ? (
                                <View style={styles.sectionContainer}>
                                    <Text style={[styles.sectionHeading, { color: colors.textGrey }]}>
                                        {isFilipino
                                            ? `MGA RESULTA (${searchResults.length})`
                                            : `SEARCH RESULTS (${searchResults.length})`}
                                    </Text>

                                    {searchResults.length === 0 ? (
                                        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                            <MaterialIcons name="search-off" size={40} color={colors.textGrey} />
                                            <Text style={[styles.emptyCardTitle, { color: colors.text }]}>
                                                {isFilipino ? 'Walang nahanap na tala' : 'No Resources Found'}
                                            </Text>
                                            <Text style={[styles.emptyCardSubtitle, { color: colors.textGrey }]}>
                                                {isFilipino
                                                    ? 'Subukang maghanap gamit ang ibang salita.'
                                                    : 'No matching documents or video links were found.'}
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={[styles.cardsGrid, isTabletOrWeb && styles.cardsGridResponsive]}>
                                            {searchResults.map((item) =>
                                                renderResourceCard(
                                                    item,
                                                    colors,
                                                    openingItemId,
                                                    downloadingItemId,
                                                    handleOpenItem,
                                                    handleViewPdf,
                                                    handleDownloadPdf,
                                                    isFilipino,
                                                    isTabletOrWeb
                                                )
                                            )}
                                        </View>
                                    )}
                                </View>
                            ) : (
                                <>
                                    {/* Folders List */}
                                    {currentSubfolders.length > 0 && (
                                        <View style={styles.sectionContainer}>
                                            <Text style={[styles.sectionHeading, { color: colors.textGrey }]}>
                                                {currentFolder
                                                    ? isFilipino ? 'MGA SUB-FOLDER' : 'SUB-FOLDERS'
                                                    : isFilipino ? 'MGA KATEGORYA NG GABAY' : 'MANUAL CATEGORIES & FOLDERS'}
                                            </Text>

                                            <View style={[styles.foldersGrid, isTabletOrWeb && styles.foldersGridResponsive]}>
                                                {currentSubfolders.map((folder) => {
                                                    const { subCount, itemCount } = getFolderCounts(folder.id);
                                                    return (
                                                        <TouchableOpacity
                                                            key={folder.id}
                                                            style={[
                                                                styles.folderCard,
                                                                isTabletOrWeb && styles.folderCardResponsive,
                                                                {
                                                                    backgroundColor: colors.surface,
                                                                    borderColor: colors.stroke,
                                                                },
                                                            ]}
                                                            activeOpacity={0.75}
                                                            onPress={() => handleEnterFolder(folder)}
                                                        >
                                                            <View style={styles.folderCardRow}>
                                                                <View style={[styles.folderIconBox, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '28' }]}>
                                                                    <MaterialIcons name="folder" size={24} color={colors.primary} />
                                                                </View>

                                                                <View style={styles.folderTextCol}>
                                                                    <Text style={[styles.folderTitle, { color: colors.text }]}>
                                                                        {folder.name}
                                                                    </Text>
                                                                    {Boolean(folder.description) && (
                                                                        <Text style={[styles.folderDesc, { color: colors.textGrey }]}>
                                                                            {folder.description}
                                                                        </Text>
                                                                    )}
                                                                    <View style={styles.folderTagsRow}>
                                                                        {subCount > 0 && (
                                                                            <View style={[styles.folderTag, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}>
                                                                                <MaterialIcons name="folder-open" size={11} color={colors.textGrey} />
                                                                                <Text style={[styles.folderTagText, { color: colors.textGrey }]}>
                                                                                    {subCount} {isFilipino ? 'subfolder' : subCount === 1 ? 'subfolder' : 'subfolders'}
                                                                                </Text>
                                                                            </View>
                                                                        )}
                                                                        <View style={[styles.folderTag, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '25' }]}>
                                                                            <MaterialIcons name="description" size={11} color={colors.primary} />
                                                                            <Text style={[styles.folderTagText, { color: colors.primary }]}>
                                                                                {itemCount} {isFilipino ? 'file' : itemCount === 1 ? 'file' : 'files'}
                                                                            </Text>
                                                                        </View>
                                                                    </View>
                                                                </View>

                                                                <View style={[styles.folderChevronCircle, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}>
                                                                    <MaterialIcons name="chevron-right" size={18} color={colors.textGrey} />
                                                                </View>
                                                            </View>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    )}

                                    {/* Inside-Folder Documents (Only shown when inside a folder) */}
                                    {currentFolder && currentFolderItems.length > 0 && (
                                        <View style={[styles.sectionContainer, currentSubfolders.length > 0 && { marginTop: 14 }]}>
                                            <Text style={[styles.sectionHeading, { color: colors.textGrey }]}>
                                                {isFilipino ? 'MGA DOKUMENTO AT VIDEO' : 'DOCUMENTS & RESOURCES'}
                                            </Text>

                                            <View style={[styles.cardsGrid, isTabletOrWeb && styles.cardsGridResponsive]}>
                                                {currentFolderItems.map((item) =>
                                                    renderResourceCard(
                                                        item,
                                                        colors,
                                                        openingItemId,
                                                        downloadingItemId,
                                                        handleOpenItem,
                                                        handleViewPdf,
                                                        handleDownloadPdf,
                                                        isFilipino,
                                                        isTabletOrWeb
                                                    )
                                                )}
                                            </View>
                                        </View>
                                    )}

                                    {/* Empty Folder State */}
                                    {currentSubfolders.length === 0 && currentFolderItems.length === 0 && (
                                        <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.stroke }]}>
                                            <MaterialIcons name="folder-open" size={42} color={colors.textGrey} />
                                            <Text style={[styles.emptyCardTitle, { color: colors.text }]}>
                                                {isFilipino ? 'Walang laman ang folder' : 'Folder is Empty'}
                                            </Text>
                                            <Text style={[styles.emptyCardSubtitle, { color: colors.textGrey }]}>
                                                {isFilipino
                                                    ? 'Wala pang nai-upload na mga manwal o video sa folder na ito.'
                                                    : 'No documents or video walk-throughs have been added here yet.'}
                                            </Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    </ScrollView>
                )}
            </View>

            {/* In-App Interactive PDF Viewer Modal */}
            <Modal
                visible={Boolean(activePdfViewerItem)}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={() => setActivePdfViewerItem(null)}
            >
                {activePdfViewerItem && (
                    <View style={[styles.modalContainer, { backgroundColor: colors.bgLight, paddingTop: insets.top }]}>
                        {/* Modal Header Bar */}
                        <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.stroke, paddingHorizontal: hPad }]}>
                            <TouchableOpacity
                                style={[styles.modalCloseButton, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}
                                onPress={() => setActivePdfViewerItem(null)}
                                activeOpacity={0.8}
                                accessibilityLabel="Close PDF viewer"
                            >
                                <MaterialIcons name="arrow-back" size={22} color={colors.text} />
                            </TouchableOpacity>

                            <View style={styles.modalTitleCol}>
                                <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
                                    {activePdfViewerItem.title}
                                </Text>
                                <Text style={[styles.modalSubtitle, { color: colors.primary }]} numberOfLines={1}>
                                    {activePdfViewerItem.category?.name || (isFilipino ? 'Dokumento ng Gabay' : 'Official Document Guide')}
                                </Text>
                            </View>

                            {/* Modal Header Actions */}
                            <View style={styles.modalHeaderActions}>
                                {/* Download Action */}
                                <TouchableOpacity
                                    style={[
                                        styles.modalActionIconButton,
                                        {
                                            backgroundColor: colors.primary + '14',
                                            borderColor: colors.primary + '30',
                                        },
                                    ]}
                                    onPress={() => handleDownloadPdf(activePdfViewerItem)}
                                    disabled={downloadingItemId === activePdfViewerItem.id}
                                    activeOpacity={0.8}
                                    accessibilityLabel="Download PDF"
                                >
                                    {downloadingItemId === activePdfViewerItem.id ? (
                                        <ActivityIndicator size="small" color={colors.primary} />
                                    ) : (
                                        <MaterialIcons name="file-download" size={20} color={colors.primary} />
                                    )}
                                </TouchableOpacity>

                                {/* Open in External App / Browser */}
                                <TouchableOpacity
                                    style={[
                                        styles.modalActionIconButton,
                                        {
                                            backgroundColor: colors.bgLight,
                                            borderColor: colors.stroke,
                                        },
                                    ]}
                                    onPress={() => openManualItem(activePdfViewerItem)}
                                    activeOpacity={0.8}
                                    accessibilityLabel="Open externally"
                                >
                                    <MaterialIcons name="open-in-new" size={18} color={colors.text} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Modal Body: In-App WebView PDF Viewer */}
                        <View style={styles.modalBody}>
                            {Platform.OS === 'web' ? (
                                <iframe
                                    src={activePdfViewerItem.content_url}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                    title={activePdfViewerItem.title}
                                />
                            ) : (
                                <WebView
                                    source={{ uri: getViewerUrl(activePdfViewerItem) }}
                                    style={styles.webView}
                                    startInLoadingState={true}
                                    renderLoading={() => (
                                        <View style={styles.viewerLoading}>
                                            <ActivityIndicator size="large" color={colors.primary} />
                                            <Text style={[styles.viewerLoadingText, { color: colors.textGrey }]}>
                                                {isFilipino ? 'Ikinakarga ang PDF...' : 'Loading PDF document...'}
                                            </Text>
                                        </View>
                                    )}
                                    javaScriptEnabled={true}
                                    domStorageEnabled={true}
                                    scalesPageToFit={true}
                                />
                            )}
                        </View>
                    </View>
                )}
            </Modal>
        </View>
    );
}

/**
 * Modern Resource Card with dual action buttons for PDFs (View in App vs Download)
 */
function renderResourceCard(
    item: ManualItem,
    colors: any,
    openingItemId: string | null,
    downloadingItemId: string | null,
    handleOpenItem: (item: ManualItem) => void,
    handleViewPdf: (item: ManualItem) => void,
    handleDownloadPdf: (item: ManualItem) => void,
    isFilipino: boolean,
    isTabletOrWeb: boolean
) {
    const meta = getItemTypeMeta(item.item_type);
    const isOpening = openingItemId === item.id;
    const isDownloading = downloadingItemId === item.id;
    const sizeStr = formatBytes(item.file_size_bytes);
    const durationStr = formatDuration(item.duration_seconds);
    const isPdf = item.item_type === 'pdf' || (item.content_url && item.content_url.toLowerCase().endsWith('.pdf'));

    return (
        <View
            key={item.id}
            style={[
                styles.resourceCard,
                isTabletOrWeb && styles.resourceCardResponsive,
                {
                    backgroundColor: colors.surface,
                    borderColor: colors.stroke,
                },
            ]}
        >
            {/* Top Row: Type Pill & Location Tag */}
            <View style={styles.resourceHeaderRow}>
                <View style={[styles.resourceTypeBadge, { backgroundColor: meta.bgColor, borderColor: meta.borderColor }]}>
                    <MaterialIcons name={meta.iconName} size={13} color={meta.color} />
                    <Text style={[styles.resourceTypeBadgeText, { color: meta.color }]}>
                        {meta.label.toUpperCase()}
                    </Text>
                </View>

                {Boolean(item.category?.name) && (
                    <View style={[styles.resourceCategoryTag, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}>
                        <MaterialIcons name="folder" size={11} color={colors.textGrey} style={{ marginRight: 3 }} />
                        <Text style={[styles.resourceCategoryTagText, { color: colors.textGrey }]}>
                            {item.category?.name}
                        </Text>
                    </View>
                )}
            </View>

            {/* Title & Description with full text wrap */}
            <Text style={[styles.resourceTitle, { color: colors.text }]}>
                {item.title}
            </Text>

            {Boolean(item.description) && (
                <Text style={[styles.resourceDesc, { color: colors.textGrey }]}>
                    {item.description}
                </Text>
            )}

            {/* Bottom Meta & 2 Distinct Action Buttons */}
            <View style={[styles.resourceFooter, { borderTopColor: colors.stroke }]}>
                <View style={styles.resourceMetaRow}>
                    {Boolean(durationStr) && (
                        <View style={[styles.metaPill, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}>
                            <MaterialIcons name="schedule" size={11} color={colors.textGrey} />
                            <Text style={[styles.metaPillText, { color: colors.textGrey }]}>
                                {durationStr}
                            </Text>
                        </View>
                    )}
                    {Boolean(sizeStr) && (
                        <View style={[styles.metaPill, { backgroundColor: colors.bgLight, borderColor: colors.stroke }]}>
                            <MaterialIcons name="attachment" size={11} color={colors.textGrey} />
                            <Text style={[styles.metaPillText, { color: colors.textGrey }]}>
                                {sizeStr}
                            </Text>
                        </View>
                    )}
                </View>

                {isPdf ? (
                    /* 2 OPTIONS FOR PDF: (1) View / Read in App (2) Download / Save */
                    <View style={styles.dualPdfButtonsRow}>
                        {/* Option 1: View in App */}
                        <TouchableOpacity
                            style={[styles.pdfPrimaryViewButton, { backgroundColor: colors.primary }]}
                            onPress={() => handleViewPdf(item)}
                            activeOpacity={0.8}
                            disabled={isOpening || isDownloading}
                        >
                            <MaterialIcons name="visibility" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.pdfPrimaryViewButtonText}>
                                {isFilipino ? 'Tingnan' : 'View'}
                            </Text>
                        </TouchableOpacity>

                        {/* Option 2: Download PDF */}
                        <TouchableOpacity
                            style={[
                                styles.pdfSecondaryDownloadButton,
                                {
                                    backgroundColor: colors.primary + '12',
                                    borderColor: colors.primary + '40',
                                },
                            ]}
                            onPress={() => handleDownloadPdf(item)}
                            activeOpacity={0.8}
                            disabled={isOpening || isDownloading}
                        >
                            {isDownloading ? (
                                <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: 4 }} />
                            ) : (
                                <MaterialIcons name="file-download" size={15} color={colors.primary} style={{ marginRight: 4 }} />
                            )}
                            <Text style={[styles.pdfSecondaryDownloadButtonText, { color: colors.primary }]}>
                                {isFilipino ? 'I-download' : 'Download'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    /* Standard Single Button for Videos / Links */
                    <TouchableOpacity
                        style={[styles.resourceActionButton, { backgroundColor: colors.primary }]}
                        onPress={() => handleOpenItem(item)}
                        activeOpacity={0.8}
                        disabled={isOpening}
                    >
                        <Text style={styles.resourceActionButtonText}>
                            {item.item_type === 'youtube' || item.item_type === 'video'
                                ? isFilipino ? 'Panoorin' : 'Watch'
                                : isFilipino ? 'Buksan' : 'Open'}
                        </Text>
                        {isOpening ? (
                            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginLeft: 5 }} />
                        ) : (
                            <MaterialIcons
                                name={item.item_type === 'youtube' || item.item_type === 'video' ? 'play-arrow' : 'open-in-new'}
                                size={14}
                                color="#FFFFFF"
                                style={{ marginLeft: 3 }}
                            />
                        )}
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
        width: '100%',
    },
    responsiveWrapper: {
        width: '100%',
        alignSelf: 'center',
    },

    // ── Header ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 16,
        paddingBottom: 16,
        width: '100%',
    },
    refreshRoundButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        elevation: 3,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
    },

    // ── Breadcrumbs Bar ──
    breadcrumbBar: {
        borderBottomWidth: 1,
        paddingVertical: 9,
    },
    breadcrumbContent: {
        alignItems: 'center',
    },
    crumbSegment: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    activeCrumbSegment: {
        borderRadius: 6,
    },
    crumbHomeIcon: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    crumbText: {
        fontSize: 12,
    },
    crumbArrow: {
        marginHorizontal: 1,
    },

    // ── Scroll Content ──
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        padding: 32,
    },
    loadingLabel: {
        fontSize: 13,
        fontFamily: 'Poppins-Medium',
    },
    scrollArea: {
        flex: 1,
    },
    scrollContent: {
        paddingTop: 8,
        paddingBottom: 60,
    },

    // ── Branded Explanatory About Card ──
    aboutCardContainer: {
        borderRadius: 20,
        borderWidth: 1.5,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 2,
    },
    aboutHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
    },
    aboutIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    aboutHeaderTexts: {
        flex: 1,
    },
    aboutTitle: {
        fontSize: 16,
        fontFamily: 'Poppins-Bold',
        lineHeight: 22,
    },
    aboutSubtitle: {
        fontSize: 11.5,
        fontFamily: 'Poppins-SemiBold',
        marginTop: 1,
    },
    aboutBodyText: {
        fontSize: 12.5,
        fontFamily: 'Poppins-Regular',
        lineHeight: 19,
    },

    // ── Active Folder Header Banner ──
    activeFolderCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 18,
        borderWidth: 1.5,
        padding: 14,
        marginBottom: 14,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
    },
    activeFolderIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    activeFolderTextCol: {
        flex: 1,
    },
    activeFolderTitle: {
        fontSize: 15.5,
        fontFamily: 'Poppins-Bold',
        marginBottom: 2,
    },
    activeFolderDesc: {
        fontSize: 12,
        fontFamily: 'Poppins-Regular',
        lineHeight: 17,
    },

    // ── Search Bar ──
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        height: 46,
        borderRadius: 14,
        borderWidth: 1.5,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
        elevation: 1.5,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 13.5,
        fontFamily: 'Poppins-Regular',
        paddingVertical: 0,
    },

    // ── Sections & Headings ──
    sectionContainer: {
        marginBottom: 12,
    },
    sectionHeading: {
        fontFamily: 'Poppins-SemiBold',
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 10,
        paddingHorizontal: 2,
    },

    // ── Modern Folder Cards ──
    foldersGrid: {
        gap: 10,
    },
    foldersGridResponsive: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    folderCard: {
        borderRadius: 18,
        borderWidth: 1.5,
        padding: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    folderCardResponsive: {
        width: '48.8%',
    },
    folderCardRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    folderIconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        flexShrink: 0,
    },
    folderTextCol: {
        flex: 1,
        marginRight: 8,
    },
    folderTitle: {
        fontSize: 15,
        fontFamily: 'Poppins-Bold',
        marginBottom: 2,
    },
    folderDesc: {
        fontSize: 12,
        fontFamily: 'Poppins-Regular',
        lineHeight: 16.5,
        marginBottom: 6,
    },
    folderTagsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
    },
    folderTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        borderRadius: 6,
        borderWidth: 1,
    },
    folderTagText: {
        fontSize: 10.5,
        fontFamily: 'Poppins-SemiBold',
    },
    folderChevronCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Resource Cards ──
    cardsGrid: {
        gap: 12,
    },
    cardsGridResponsive: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    resourceCard: {
        borderRadius: 18,
        borderWidth: 1.5,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    resourceCardResponsive: {
        width: '48.8%',
    },
    resourceHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        flexWrap: 'wrap',
        gap: 6,
    },
    resourceTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        borderRadius: 6,
        borderWidth: 1,
    },
    resourceTypeBadgeText: {
        fontSize: 10,
        fontFamily: 'Poppins-Bold',
        letterSpacing: 0.4,
    },
    resourceCategoryTag: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        flexShrink: 1,
    },
    resourceCategoryTagText: {
        fontSize: 11,
        fontFamily: 'Poppins-Medium',
    },
    resourceTitle: {
        fontSize: 15,
        fontFamily: 'Poppins-Bold',
        lineHeight: 21,
        marginTop: 2,
        marginBottom: 4,
    },
    resourceDesc: {
        fontSize: 12.5,
        fontFamily: 'Poppins-Regular',
        lineHeight: 18,
        marginBottom: 12,
    },
    resourceFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        paddingTop: 10,
        flexWrap: 'wrap',
        gap: 8,
    },
    resourceMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
    },
    metaPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
    },
    metaPillText: {
        fontSize: 10.5,
        fontFamily: 'Poppins-Regular',
    },

    // ── Dual Action Buttons for PDF ──
    dualPdfButtonsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pdfPrimaryViewButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6.5,
        borderRadius: 8,
        elevation: 1,
    },
    pdfPrimaryViewButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontFamily: 'Poppins-SemiBold',
    },
    pdfSecondaryDownloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5.5,
        borderRadius: 8,
        borderWidth: 1,
    },
    pdfSecondaryDownloadButtonText: {
        fontSize: 12,
        fontFamily: 'Poppins-SemiBold',
    },

    // ── Standard Action Button ──
    resourceActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    resourceActionButtonText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontFamily: 'Poppins-SemiBold',
    },

    // ── Empty State ──
    emptyCard: {
        borderRadius: 18,
        borderWidth: 1.5,
        padding: 28,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 10,
    },
    emptyCardTitle: {
        fontSize: 15,
        fontFamily: 'Poppins-Bold',
        textAlign: 'center',
    },
    emptyCardSubtitle: {
        fontSize: 12,
        fontFamily: 'Poppins-Regular',
        textAlign: 'center',
        lineHeight: 17,
    },

    // ── In-App PDF Viewer Modal Styles ──
    modalContainer: {
        flex: 1,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 1,
        gap: 10,
    },
    modalCloseButton: {
        width: 38,
        height: 38,
        borderRadius: 19,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalTitleCol: {
        flex: 1,
    },
    modalTitle: {
        fontSize: 14.5,
        fontFamily: 'Poppins-Bold',
    },
    modalSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins-Medium',
    },
    modalHeaderActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalActionIconButton: {
        width: 38,
        height: 38,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBody: {
        flex: 1,
        position: 'relative',
    },
    webView: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    viewerLoading: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FFFFFF',
        zIndex: 10,
    },
    viewerLoadingText: {
        fontSize: 13,
        fontFamily: 'Poppins-Medium',
        marginTop: 10,
    },
});


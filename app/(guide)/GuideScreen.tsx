import { MaterialIcons } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { Header } from '@/components/Header';
import { AIInsightCard } from '@/components/AIInsightCard';
import { SelectionModal } from '@/components/SelectionModal';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useGuideStyles } from '@/styles/guideStyles';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { computeAgeDays, computePigCareRecommendation } from '@/constants/pigCare';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BatchSummary {
    id: string;
    name: string;
    animal_type: 'pig' | 'chicken';
    current_count: number;
    arrival_date: string;
    age_at_arrival_days: number;
    housings: { name: string } | null;
}

// ─── Phase definitions ────────────────────────────────────────────────────────

const CHICKEN_PHASES = [
    {
        name: 'Arrival Phase',
        dayRange: 'Day 1-7',
        start: 1, end: 7,
        description: 'Newly arrived chicks. Ensure brooding temp is ~32-35°C. Provide clean water with electrolytes immediately upon arrival.',
        actionable: 'Action: Inspect for weak chicks and isolate. Keep feed easily accessible on flat trays.',
    },
    {
        name: 'Starter Phase',
        dayRange: 'Day 8-14',
        start: 8, end: 14,
        description: 'Crucial for early organ and bone development. Focus on high-protein (min 21%) Starter Mash.',
        actionable: 'Action: Gradually increase ventilation. Expand feeding space to prevent overcrowding at feeders.',
    },
    {
        name: 'Booster Phase',
        dayRange: 'Day 15-25',
        start: 15, end: 25,
        description: 'Feed upgraded to Grower pellets as rapid muscle development accelerates. Monitor weight gains strictly.',
        actionable: 'Action: Lower temperatures to ambient levels. Shift to hanging feeders to prevent feed waste.',
    },
    {
        name: 'Finisher Phase',
        dayRange: 'Day 26-42',
        start: 26, end: 42,
        description: 'Approaching target harvest weight. Feed energy density is prioritized over protein for fat marbling.',
        actionable: 'Action: Ensure maximum water flow rate. Minimize flock disturbances to reduce stress metabolism.',
    },
    {
        name: 'Mature Phase',
        dayRange: 'Day 43+',
        start: 43, end: 999,
        description: 'Target weight reached; birds are finalized for sale or processing.',
        actionable: 'Action: Prepare harvest schedule and sanitize bio-secure transfer crates.',
    },
];

const PIG_PHASES = [
    {
        name: 'Arrival Phase',
        dayRange: 'Day 1-5',
        start: 1, end: 5,
        description: 'Piglets received. Housing must be disinfected and pre-warmed. Provide highly digestible starter feed.',
        actionable: 'Action: Monitor carefully for signs of scouring (diarrhea). Provide constant access to fresh water.',
    },
    {
        name: 'Starter Phase',
        dayRange: 'Day 6-30',
        start: 6, end: 30,
        description: 'First month transition. Gut biome is adapting. High protein required for skeletal frame growth.',
        actionable: 'Action: Maintain strict pen hygiene. Introduce creeping feeder pellets gradually to avoid digestive shock.',
    },
    {
        name: 'Grower Phase',
        dayRange: 'Day 31-90',
        start: 31, end: 90,
        description: 'Intense lean muscle growth period. Feed converted efficiently to muscle mass. Weekly weighing is ideal.',
        actionable: 'Action: Scale up feed volume significantly. Ensure cooling misting systems are operational during hot days.',
    },
    {
        name: 'Finisher Phase',
        dayRange: 'Day 91-120',
        start: 91, end: 120,
        description: 'Approaching final target market weight. Diet shifted towards higher energy to build fat reserves.',
        actionable: 'Action: Monitor pen density as pigs grow rapidly. Sort and segregate by size if necessary to prevent bullying.',
    },
    {
        name: 'Mature Phase',
        dayRange: 'Day 121+',
        start: 121, end: 999,
        description: 'Target weight reached (approx 90-100kg); ready for sale or slaughter.',
        actionable: 'Action: Restrict feed 12-18 hours prior to transport. Organize quiet and low-stress loading.',
    },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GuideScreen() {
    const router = useRouter();
    const { profile, permissions, role, isLoading: authLoading } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? '';
    const styles = useGuideStyles();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    const RESTRICTED_ROLES = ['caretaker', 'veterinarian', 'flockman'];
    useEffect(() => {
        if (authLoading || !role) return;
        if (RESTRICTED_ROLES.includes(role) && !permissions['ai_assistant:use']) {
            router.replace('/(dashboard)/HomeScreen' as any);
        }
    }, [authLoading, role, permissions]);

    // ── State ─────────────────────────────────────────────────────────────────
    const [animalFilter, setAnimalFilter] = useState<'Pigs' | 'Chickens'>('Pigs');
    const [batches, setBatches] = useState<BatchSummary[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [isBatchLoading, setIsBatchLoading] = useState(true);
    const [batchModalVisible, setBatchModalVisible] = useState(false);

    // ── Fetch active batches ───────────────────────────────────────────────────
    const fetchBatches = useCallback(async () => {
        if (!farmId) { setIsBatchLoading(false); return; }
        setIsBatchLoading(true);
        try {
            const { data: housingData } = await supabase
                .from('housings')
                .select('id')
                .eq('farm_id', farmId);
            const housingIds = (housingData ?? []).map((h: any) => h.id);
            if (housingIds.length === 0) { setIsBatchLoading(false); return; }

            const { data } = await supabase
                .from('batches')
                .select('id, name, animal_type, current_count, arrival_date, age_at_arrival_days, housings(name)')
                .in('housing_id', housingIds)
                .eq('status', 'active')
                .order('arrival_date', { ascending: false });

            setBatches((data ?? []) as unknown as BatchSummary[]);
        } catch (err) {
            console.error('[GuideScreen] fetchBatches error:', err);
        } finally {
            setIsBatchLoading(false);
        }
    }, [farmId]);

    useEffect(() => { fetchBatches(); }, [fetchBatches]);

    // ── Auto-select first batch whenever animal filter or batch list changes ──
    useEffect(() => {
        const filtered = batches.filter(b =>
            animalFilter === 'Pigs' ? b.animal_type === 'pig' : b.animal_type === 'chicken'
        );
        setSelectedBatchId(filtered[0]?.id ?? null);
    }, [animalFilter, batches]);

    // ── Derived values ────────────────────────────────────────────────────────
    const phases = animalFilter === 'Chickens' ? CHICKEN_PHASES : PIG_PHASES;

    const filteredBatches = batches.filter(b =>
        animalFilter === 'Pigs' ? b.animal_type === 'pig' : b.animal_type === 'chicken'
    );

    const selectedBatch = filteredBatches.find(b => b.id === selectedBatchId) ?? null;

    const batchOptions = filteredBatches.map(b => {
        const ageDays = computeAgeDays(b.arrival_date, b.age_at_arrival_days ?? 0);
        return `${b.name} (Day ${ageDays})`;
    });

    const selectedBatchLabel = selectedBatch
        ? `${selectedBatch.name} (Day ${computeAgeDays(selectedBatch.arrival_date, selectedBatch.age_at_arrival_days ?? 0)})`
        : 'Select Batch';

    // Real age in days from selected batch, null if no batch
    const currentDay = selectedBatch
        ? computeAgeDays(selectedBatch.arrival_date, selectedBatch.age_at_arrival_days ?? 0)
        : null;

    const getCurrentPhaseIndex = () => {
        if (currentDay === null) return -1;
        const idx = phases.findIndex(p => currentDay >= p.start && currentDay <= p.end);
        return idx !== -1 ? idx : phases.length - 1;
    };
    const currentPhaseIndex = getCurrentPhaseIndex();

    // Build AI context from real batch data — Claude reasons freely, not from static strings
    const buildAIContext = () => {
        if (!selectedBatch || currentDay === null) {
            return {
                type: 'animal' as const,
                animalType: animalFilter === 'Pigs' ? 'pig' : 'chicken',
                data: {
                    note: 'No active batch selected. Provide general best-practice advice for this animal type.',
                },
            };
        }

        const base = {
            batchName: selectedBatch.name,
            housingName: (selectedBatch.housings as any)?.name ?? '',
            ageDays: currentDay,
            liveHeads: selectedBatch.current_count,
            currentPhase: currentPhaseIndex >= 0 ? phases[currentPhaseIndex].name : 'Unknown',
        };

        // For pigs: add lightweight care-schedule snapshot so AI has real context
        if (animalFilter === 'Pigs') {
            const rec = computePigCareRecommendation(currentDay);
            return {
                type: 'animal' as const,
                animalType: 'pig',
                housingName: base.housingName,
                data: {
                    ...base,
                    currentFeedStage: rec.feedStage,
                    currentFeed: rec.feedProduct,
                    dailyFeedAmount: rec.dailyAmount,
                    careActionsDueNow: rec.dueNow.map(c =>
                        c.medication ? `${c.action} — ${c.medication} (${c.dosage})` : c.action
                    ),
                    careActionsUpcoming: rec.upcoming.slice(0, 3).map(c =>
                        `Day ${c.day_start}: ${c.action}${c.medication ? ' (' + c.medication + ')' : ''}`
                    ),
                    overdueActions: rec.recentlyOverdue.map(c => c.action),
                },
            };
        }

        // For chickens: just the batch facts — Claude uses its own knowledge
        return {
            type: 'animal' as const,
            animalType: 'chicken',
            housingName: base.housingName,
            data: base,
        };
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Fixed App Header */}
            <Header />

            {/* Page Title */}
            <View style={styles.headerContainer}>
                <View style={styles.headerTextContainer}>
                    <Text style={[textStyles.h1, { color: colors.text, fontSize: 32 }]}>
                        Actionable Guide
                    </Text>
                    <Text style={[textStyles.body, styles.headerSubtitle, { color: colors.textGrey, fontSize: 16 }]}>
                        Track growth timelines and best practices
                    </Text>
                </View>
            </View>

            {/* ── Animal Tab Filter (unchanged) ── */}
            <View style={styles.filterContainer}>
                {(['Pigs', 'Chickens'] as const).map((filter) => (
                    <TouchableOpacity
                        key={filter}
                        activeOpacity={0.7}
                        onPress={() => setAnimalFilter(filter)}
                        style={[styles.filterChip, animalFilter === filter && styles.filterChipActive]}
                    >
                        <Text style={[styles.filterChipText, animalFilter === filter && styles.filterChipTextActive]}>
                            {filter}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* ── Batch Filter Dropdown ── */}
            {isBatchLoading ? (
                <View style={{ paddingHorizontal: hPad, paddingBottom: 8 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                </View>
            ) : filteredBatches.length > 0 ? (
                <View style={{ paddingHorizontal: hPad, marginBottom: 12 }}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: colors.surface,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            borderRadius: 12,
                            paddingHorizontal: 16,
                            height: 48,
                            elevation: 1,
                            shadowColor: colors.shadow,
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.2,
                            shadowRadius: 2,
                        }}
                        onPress={() => setBatchModalVisible(true)}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <MaterialIcons name="layers" size={20} color={colors.textGrey} style={{ marginRight: 10 }} />
                            <Text style={[textStyles.body, { color: colors.text, fontSize: 14 }]}>
                                {selectedBatchLabel}
                            </Text>
                        </View>
                        <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                    </TouchableOpacity>
                </View>
            ) : (
                !isBatchLoading && (
                    <View style={{ paddingHorizontal: hPad, paddingBottom: 10 }}>
                        <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                            No active {animalFilter.toLowerCase()} batches found.
                        </Text>
                    </View>
                )
            )}

            <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.container}
                contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: hPad }}
            >
                {/* ── Header card — real day + phase from selected batch ── */}
                <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: colors.surface,
                    padding: 16,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.stroke,
                    shadowColor: colors.shadow,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 8,
                    elevation: 2,
                    marginBottom: 24,
                    marginTop: 8,
                }}>
                    <View style={{ flex: 1, marginRight: 16 }}>
                        <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 4 }]}>
                            {animalFilter} Timeline
                        </Text>
                        {selectedBatch && currentPhaseIndex >= 0 ? (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20 }]}>
                                <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.textGrey }}>
                                    {selectedBatch.name}
                                </Text>
                                {' '}is in{' '}
                                <Text style={{ fontFamily: 'Poppins-Bold', color: colors.primary }}>
                                    {phases[currentPhaseIndex].name}
                                </Text>
                                . Actionable steps below are tailored for today.
                            </Text>
                        ) : (
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20 }]}>
                                {selectedBatch
                                    ? `${selectedBatch.name} · Day ${currentDay}`
                                    : 'Select a batch above to see real-time guidance.'}
                            </Text>
                        )}
                    </View>

                    {/* Day badge — real age or "—" */}
                    <View style={[styles.dayBadge, {
                        marginBottom: 0,
                        backgroundColor: currentDay !== null ? colors.primary + '1A' : colors.cardFill,
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: 'center',
                        shadowOpacity: 0,
                        elevation: 0,
                    }]}>
                        <Text style={[textStyles.label, { color: currentDay !== null ? colors.primary : colors.textGrey, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' }]}>
                            DAY
                        </Text>
                        <Text style={[textStyles.h1, { color: currentDay !== null ? colors.primary : colors.textGrey, fontSize: 28, lineHeight: 28 }]}>
                            {currentDay !== null ? currentDay : '—'}
                        </Text>
                    </View>
                </View>

                {/* ── AniBot Insight — real AI, not static string ── */}
                {!isBatchLoading && selectedBatchId && (
                    <AIInsightCard
                        title="AniBot Insight"
                        context={buildAIContext()}
                        variant="green"
                    />
                )}

                {/* ── Timeline List View (unchanged UI) ── */}
                <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 16 }]}>Growth Phases</Text>

                <View style={{ marginBottom: 20 }}>
                    {phases.map((phase, index) => {
                        const isPast    = currentPhaseIndex >= 0 && index < currentPhaseIndex;
                        const isCurrent = currentPhaseIndex >= 0 && index === currentPhaseIndex;
                        const isFuture  = currentPhaseIndex < 0  || index > currentPhaseIndex;

                        const circleColor = isPast ? colors.primary : isCurrent ? colors.warning : colors.surface;
                        const borderColor = isPast ? colors.primary : isCurrent ? colors.warning : colors.stroke;
                        const titleColor  = isCurrent ? colors.warning : colors.text;

                        return (
                            <View key={index} style={{ flexDirection: 'row', marginBottom: index === phases.length - 1 ? 0 : 20 }}>
                                {/* Timeline Line/Dots */}
                                <View style={{ width: 32, alignItems: 'center', marginRight: 16 }}>
                                    <View style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: 12,
                                        backgroundColor: circleColor,
                                        borderWidth: 2,
                                        borderColor: borderColor,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 2,
                                        shadowColor: isCurrent ? colors.warning : 'transparent',
                                        shadowOpacity: 0.4,
                                        shadowRadius: 8,
                                        shadowOffset: { width: 0, height: 0 },
                                    }}>
                                        {isPast    && <MaterialIcons name="check" size={14} color="#FFF" />}
                                        {isCurrent && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />}
                                    </View>

                                    {index < phases.length - 1 && (
                                        <View style={{
                                            width: 2,
                                            flex: 1,
                                            backgroundColor: isPast ? colors.primary : colors.stroke,
                                            marginBottom: -20,
                                            marginTop: 4,
                                        }} />
                                    )}
                                </View>

                                {/* Content Card */}
                                <View style={{ flex: 1, opacity: isFuture && currentPhaseIndex >= 0 ? 0.6 : 1, paddingBottom: 8 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                        <Text style={[textStyles.h2, { color: titleColor, fontSize: 18 }]}>
                                            {phase.name}
                                        </Text>
                                    </View>

                                    <View style={{
                                        alignSelf: 'flex-start',
                                        backgroundColor: isCurrent ? colors.warning + '1A' : colors.inputFill,
                                        paddingHorizontal: 8,
                                        paddingVertical: 4,
                                        borderRadius: 6,
                                        marginBottom: 10,
                                    }}>
                                        <Text style={[textStyles.label, {
                                            color: isCurrent ? colors.warning : colors.textGrey,
                                            fontSize: 11,
                                        }]}>
                                            {phase.dayRange.toUpperCase()}
                                        </Text>
                                    </View>

                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14, lineHeight: 22, marginBottom: 8 }]}>
                                        {phase.description}
                                    </Text>

                                    {(isCurrent || isPast) && (
                                        <View style={{
                                            flexDirection: 'row',
                                            backgroundColor: isCurrent ? colors.warning + '1A' : colors.surface,
                                            padding: 12,
                                            borderRadius: 8,
                                            borderWidth: 1,
                                            borderColor: isCurrent ? colors.warning + '4D' : colors.stroke,
                                            marginTop: 4,
                                        }}>
                                            <MaterialIcons name="lightbulb" size={16} color={isCurrent ? colors.warning : colors.primary} style={{ marginRight: 8, marginTop: 2 }} />
                                            <Text style={[textStyles.body, { color: isCurrent ? colors.text : colors.textGrey, fontSize: 13, flex: 1, lineHeight: 20 }]}>
                                                {phase.actionable}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </View>
            </ScrollView>

            <FloatingNavBar />

            <SelectionModal
                visible={batchModalVisible}
                onClose={() => setBatchModalVisible(false)}
                onSelect={(val) => {
                    const idx = batchOptions.indexOf(val);
                    if (idx >= 0) {
                        setSelectedBatchId(filteredBatches[idx].id);
                    }
                    setBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Choose an active batch to view its growth timeline guide."
                icon="layers"
                options={batchOptions}
                selectedValue={selectedBatchLabel}
                requireConfirm={false}
                enableSearch={false}
            />
        </SafeAreaView>
    );
}

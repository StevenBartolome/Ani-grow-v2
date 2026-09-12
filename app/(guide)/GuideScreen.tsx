import { MaterialIcons } from '@expo/vector-icons';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ActivityIndicator,
    Alert,
    Keyboard,
    LayoutAnimation,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    UIManager,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { Header } from '@/components/Header';
import { SelectionModal } from '@/components/SelectionModal';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notify';
import {
    PIG_GUIDE_DATA,
    CHICKEN_GUIDE_DATA,
    DEMO_BATCHES,
    type GuidePhaseItem,
    type SOPAction,
} from '@/constants/guideMockData';
import {
    getEffectiveRoadmap,
    saveAIAdjustedPhase,
    sortActionsByDay,
    getBatchActionLogs,
    recordRoadmapAction,
    deleteRoadmapActionLog,
    getActionLogKey,
    type RoadmapActionLog,
} from '@/lib/roadmapService';
import {
    getLatestBatchWeight,
    type BatchWeightSummary,
} from '@/lib/weightService';
import {
    getRoadmapAdjustment,
} from '@/lib/ai';

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

/**
 * Checks if a given dayTag (e.g. 'Day 3', 'Day 1–5', 'Pre-Arrival') applies to the specified day number.
 */
function isDayMatching(dayTag: string | undefined, day: number): boolean {
    if (!dayTag) return false;
    const tag = dayTag.trim().toLowerCase();
    if (tag === 'pre-arrival' && day <= 1) return true;
    if (tag.includes('harvest') || tag.includes('pre-haul') || tag.includes('pre-catch')) return false;

    // Range like "Day 1-5" or "Day 1–5" or "Day 6–30"
    const rangeMatch = tag.match(/day\s*(\d+)\s*[-–—to]+\s*(\d+)/i);
    if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        return day >= start && day <= end;
    }

    // Single day like "Day 3" or "Day 14"
    const singleMatch = tag.match(/day\s*(\d+)/i);
    if (singleMatch) {
        const single = parseInt(singleMatch[1], 10);
        return day === single;
    }

    return false;
}

const mapIconName = (icon: string): React.ComponentProps<typeof MaterialIcons>['name'] => {
    switch (icon) {
        case 'thermostat': return 'thermostat';
        case 'water_drop': return 'water-drop';
        case 'medical_services': return 'medical-services';
        case 'restaurant': return 'restaurant';
        case 'science': return 'science';
        case 'biotech': return 'biotech';
        case 'sanitizer': return 'sanitizer';
        case 'scale': return 'scale';
        case 'insights': return 'insights';
        case 'bolt': return 'bolt';
        case 'calendar_today': return 'calendar-today';
        case 'lightbulb': return 'lightbulb';
        case 'format_list_bulleted': return 'format-list-bulleted';
        case 'warning': return 'warning-amber';
        case 'check': return 'check';
        case 'check_circle': return 'check-circle';
        case 'trending_up': return 'trending-up';
        default: return 'info';
    }
};

const SKIP_REASON_OPTIONS = [
    'Feed / Meds out of stock',
    'Weather or temperature constraints',
    'Veterinarian advised against',
    'Animal showed adverse symptoms',
    'Already completed previously',
    'Labor / Equipment shortage',
];

export default function GuideScreen() {
    const insets = useSafeAreaInsets();
    const textStyles = useTextStyles();
    const { colors, isDark } = useTheme();
    const { profile } = useAuth();
    const { activeFarmIds } = useFarmFilter();
    const { width } = useWindowDimensions();

    const hPad = width >= 600 ? Math.round(width * 0.07) : 20;
    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';

    // ─── View Mode: 'dashboard' or 'full-guide' Subpage ────────────────────────
    const [viewMode, setViewMode] = useState<'dashboard' | 'full-guide'>('dashboard');

    // ─── Filter & Selection States ─────────────────────────────────────────────
    const [animalFilter, setAnimalFilter] = useState<'pig' | 'chicken'>('pig');
    const [batches, setBatches] = useState<BatchSummary[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [isBatchLoading, setIsBatchLoading] = useState(true);
    const [isBatchModalVisible, setIsBatchModalVisible] = useState(false);

    // ─── Database-Loaded Roadmap & Weight States ────────────────────────────────
    const [phaseGuideList, setPhaseGuideList] = useState<GuidePhaseItem[]>(
        animalFilter === 'pig' ? PIG_GUIDE_DATA : CHICKEN_GUIDE_DATA
    );
    const [isRoadmapLoading, setIsRoadmapLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [weightSummary, setWeightSummary] = useState<BatchWeightSummary>({
        latestAvgWeightKg: null,
        minWeightKg: null,
        maxWeightKg: null,
        recordCount: 0,
        latestRecordedAt: null,
    });
    const [isAiAdjusting, setIsAiAdjusting] = useState<Record<string, boolean>>({});

    // Roadmap Tab Filter & Collapsed Phase States
    const [roadmapPhaseFilter, setRoadmapPhaseFilter] = useState<string>('all');
    const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({});

    // ─── Roadmap Action Logs & Skip Modal States ──────────────────────────────
    const [actionLogs, setActionLogs] = useState<Record<string, RoadmapActionLog>>({});
    const [skipModalVisible, setSkipModalVisible] = useState(false);
    const [selectedActionForSkip, setSelectedActionForSkip] = useState<{
        actionItem: SOPAction;
        phaseId: string;
        farmDay: number;
    } | null>(null);
    const [skipReason, setSkipReason] = useState('');
    const [isSubmittingReason, setIsSubmittingReason] = useState(false);

    // ─── Fetch Active Batches with Demo Fallback ────────────────────────────────
    const fetchBatches = useCallback(async () => {
        if (!farmId) {
            setIsBatchLoading(false);
            return;
        }
        setIsBatchLoading(true);
        try {
            const { data: housingData } = await supabase
                .from('housings')
                .select('id')
                .eq('farm_id', farmId);

            const housingIds = (housingData ?? []).map((h: any) => h.id);
            if (housingIds.length === 0) {
                setBatches([]);
                setIsBatchLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('batches')
                .select('id, name, animal_type, current_count, arrival_date, age_at_arrival_days, housings(name)')
                .in('housing_id', housingIds)
                .eq('status', 'active')
                .order('arrival_date', { ascending: false });

            if (error) throw error;
            setBatches((data ?? []) as unknown as BatchSummary[]);
        } catch (err) {
            console.error('[GuideScreen] fetchBatches error:', err);
        } finally {
            setIsBatchLoading(false);
        }
    }, [farmId]);

    useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    // ─── Filter Batches (Combining Real with Demo Batches if empty) ──────────────
    const allBatchesForType = useMemo(() => {
        const real = batches.filter(b => b.animal_type === animalFilter);
        if (real.length > 0) return real;
        return DEMO_BATCHES.filter(b => b.animal_type === animalFilter) as unknown as BatchSummary[];
    }, [animalFilter, batches]);

    useEffect(() => {
        setSelectedBatchId(allBatchesForType[0]?.id ?? null);
        setRoadmapPhaseFilter('all');
    }, [animalFilter, allBatchesForType]);

    const selectedBatch = useMemo(() => {
        return allBatchesForType.find(b => b.id === selectedBatchId) ?? allBatchesForType[0] ?? null;
    }, [allBatchesForType, selectedBatchId]);

    // ─── Fetch Action Logs for Selected Batch ──────────────────────────────────
    const fetchActionLogs = useCallback(async () => {
        if (!farmId || !selectedBatch?.id) {
            setActionLogs({});
            return;
        }
        try {
            const logsMap = await getBatchActionLogs(farmId, selectedBatch.id);
            setActionLogs(logsMap);
        } catch (err) {
            console.error('[GuideScreen] fetchActionLogs error:', err);
        }
    }, [farmId, selectedBatch?.id]);

    useEffect(() => {
        fetchActionLogs();
    }, [fetchActionLogs]);

    // ─── Fetch Database-Backed Roadmap & Batch Weight ────────────────────────────
    const fetchRoadmapAndWeight = useCallback(async () => {
        if (!farmId) {
            setPhaseGuideList(animalFilter === 'pig' ? PIG_GUIDE_DATA : CHICKEN_GUIDE_DATA);
            return;
        }
        setIsRoadmapLoading(true);
        try {
            const [roadmapPhases, weightData] = await Promise.all([
                getEffectiveRoadmap(farmId, animalFilter, selectedBatch?.id),
                getLatestBatchWeight(selectedBatch?.id),
            ]);
            setPhaseGuideList(roadmapPhases);
            setWeightSummary(weightData);
        } catch (err) {
            console.error('[GuideScreen] fetchRoadmapAndWeight error:', err);
            setPhaseGuideList(animalFilter === 'pig' ? PIG_GUIDE_DATA : CHICKEN_GUIDE_DATA);
        } finally {
            setIsRoadmapLoading(false);
        }
    }, [farmId, animalFilter, selectedBatch?.id]);

    useEffect(() => {
        fetchRoadmapAndWeight();
    }, [fetchRoadmapAndWeight]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchBatches(), fetchRoadmapAndWeight(), fetchActionLogs()]);
        setRefreshing(false);
    }, [fetchBatches, fetchRoadmapAndWeight, fetchActionLogs]);

    // ─── Compute Age and Phase ──────────────────────────────────────────────────
    const currentDay = useMemo(() => {
        if (!selectedBatch?.arrival_date) return 1;
        const arr = new Date(selectedBatch.arrival_date);
        const today = new Date();
        arr.setHours(0, 0, 0, 0);
        today.setHours(0, 0, 0, 0);
        const diff = Math.floor((today.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(1, diff + (selectedBatch.age_at_arrival_days || 1));
    }, [selectedBatch]);

    // Today's natural phase index based on batch age
    const naturalPhaseIndex = useMemo(() => {
        const idx = phaseGuideList.findIndex(p => currentDay >= p.dayStart && currentDay <= p.dayEnd);
        return idx !== -1 ? idx : phaseGuideList.length - 1;
    }, [currentDay, phaseGuideList]);

    const naturalPhase = phaseGuideList[naturalPhaseIndex] || phaseGuideList[0];
    const availablePhases = useMemo(() => {
        return phaseGuideList.slice(0, naturalPhaseIndex + 1);
    }, [phaseGuideList, naturalPhaseIndex]);

    const totalBenchmarkDays = phaseGuideList[phaseGuideList.length - 1]?.dayEnd || (animalFilter === 'pig' ? 150 : 45);
    const daysInPhase = Math.max(1, currentDay - naturalPhase.dayStart + 1);
    const totalDaysInPhase = Math.max(1, naturalPhase.dayEnd - naturalPhase.dayStart + 1);
    const daysRemaining = naturalPhaseIndex < phaseGuideList.length - 1
        ? Math.max(1, phaseGuideList[naturalPhaseIndex].dayEnd - currentDay + 1)
        : 0;

    const filteredRoadmapPhases = useMemo(() => {
        if (roadmapPhaseFilter === 'all') return availablePhases;
        return availablePhases.filter(p => p.id === roadmapPhaseFilter);
    }, [availablePhases, roadmapPhaseFilter]);

    // ─── Filter Today's Tasks for the Main Dashboard Card ─────────────────────
    const todayTasksForCurrentPhase = useMemo(() => {
        const rawActions = naturalPhase?.fullGuideActions || [];
        const sorted = sortActionsByDay(rawActions);
        const matched = sorted.filter(act => isDayMatching(act.dayTag, currentDay));
        return matched.length > 0 ? matched : sorted;
    }, [naturalPhase, currentDay]);

    // ─── Batch Options for Selection Modal ─────────────────────────────────────
    const batchOptions = useMemo(() => {
        return allBatchesForType.map(b => {
            const arr = new Date(b.arrival_date);
            const today = new Date();
            arr.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            const diff = Math.floor((today.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
            const age = Math.max(1, diff + (b.age_at_arrival_days || 1));
            return `${b.name} (Day ${age})`;
        });
    }, [allBatchesForType]);

    const selectedBatchLabel = selectedBatch
        ? `${selectedBatch.name} (Day ${currentDay})`
        : 'Select Batch';

    // ─── Toggle Collapse Helper ───────────────────────────────────────────────
    const togglePhaseCollapse = (phaseId: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedPhases(prev => ({
            ...prev,
            [phaseId]: prev[phaseId] !== undefined ? !prev[phaseId] : true,
        }));
    };

    const isPhaseOpen = (phase: GuidePhaseItem, isPast: boolean) => {
        if (expandedPhases[phase.id] !== undefined) {
            return expandedPhases[phase.id];
        }
        // Past phases are collapsed by default; current & active phases are open
        return !isPast;
    };

    // ─── Roadmap Action Handlers (Done, Skip / Reject with Note, Undo) ────────
    const handleCompleteAction = async (actionItem: SOPAction, phaseId: string, dayNumber?: number) => {
        if (!farmId || !selectedBatch) return;
        const taskDay = dayNumber ?? currentDay;
        const key = getActionLogKey(phaseId, actionItem.action, taskDay);
        const existing = actionLogs[key];

        // If already completed, toggle off / undo
        if (existing && existing.status === 'completed') {
            handleUndoAction(actionItem, phaseId, taskDay);
            return;
        }

        const isAI = typeof actionItem.action === 'string' && actionItem.action.startsWith('[AI Adjustment]');

        // Optimistic update
        const tempLog: RoadmapActionLog = {
            id: existing?.id || 'temp-' + Date.now(),
            farm_id: farmId,
            batch_id: selectedBatch.id,
            animal_type: animalFilter,
            phase_id: phaseId,
            action_text: actionItem.action,
            day_tag: actionItem.dayTag,
            farm_day: taskDay,
            status: 'completed',
            is_ai_suggestion: isAI,
            recorded_by: (profile as any)?.id || null,
            recorded_at: new Date().toISOString(),
        };

        setActionLogs(prev => ({ ...prev, [key]: tempLog }));

        const saved = await recordRoadmapAction(tempLog);
        if (saved) {
            setActionLogs(prev => ({ ...prev, [key]: saved }));
        }
    };

    const handleOpenSkipModal = (actionItem: SOPAction, phaseId: string, dayNumber?: number) => {
        const taskDay = dayNumber ?? currentDay;
        const key = getActionLogKey(phaseId, actionItem.action, taskDay);
        const existing = actionLogs[key];
        setSelectedActionForSkip({
            actionItem,
            phaseId,
            farmDay: taskDay,
        });
        setSkipReason(existing?.reason_notes || '');
        setSkipModalVisible(true);
    };

    const handleSubmitSkipReason = async () => {
        if (!selectedActionForSkip || !farmId || !selectedBatch) return;
        if (!skipReason.trim()) {
            Alert.alert('Reason Required', 'Please provide a note or select a reason why this action was skipped or rejected.');
            return;
        }

        setIsSubmittingReason(true);
        const { actionItem, phaseId, farmDay } = selectedActionForSkip;
        const isAI = typeof actionItem.action === 'string' && actionItem.action.startsWith('[AI Adjustment]');
        const key = getActionLogKey(phaseId, actionItem.action, farmDay);

        const tempLog: RoadmapActionLog = {
            farm_id: farmId,
            batch_id: selectedBatch.id,
            animal_type: animalFilter,
            phase_id: phaseId,
            action_text: actionItem.action,
            day_tag: actionItem.dayTag,
            farm_day: farmDay,
            status: 'rejected',
            reason_notes: skipReason.trim(),
            is_ai_suggestion: isAI,
            recorded_by: (profile as any)?.id || null,
            recorded_at: new Date().toISOString(),
        };

        setActionLogs(prev => ({ ...prev, [key]: tempLog }));
        setSkipModalVisible(false);
        setIsSubmittingReason(false);

        const saved = await recordRoadmapAction(tempLog);
        if (saved) {
            setActionLogs(prev => ({ ...prev, [key]: saved }));
        }
    };

    const handleUndoAction = async (actionItem: SOPAction, phaseId: string, dayNumber?: number) => {
        if (!farmId || !selectedBatch) return;
        const taskDay = dayNumber ?? currentDay;
        const key = getActionLogKey(phaseId, actionItem.action, taskDay);
        const existing = actionLogs[key];
        if (!existing) return;

        // Optimistic removal
        setActionLogs(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
        });

        if (existing.id && !existing.id.startsWith('temp-')) {
            await deleteRoadmapActionLog(existing.id, farmId);
        }
    };

    // ─── Trigger AI Dynamic Adjustment for a Phase ─────────────────────────────
    const handleTriggerAIAdjustment = async (phase: GuidePhaseItem) => {
        if (!farmId || !selectedBatch) return;
        setIsAiAdjusting(prev => ({ ...prev, [phase.id]: true }));
        try {
            const aiResult = await getRoadmapAdjustment({
                farmId,
                animalType: animalFilter,
                batchName: selectedBatch.name,
                phaseId: phase.id,
                phaseName: phase.name,
                dayRange: phase.dayRange,
                currentDay,
                targetWeightRaw: phase.targetWeight,
                targetWeightMin: phase.targetWeightMin,
                targetWeightMax: phase.targetWeightMax,
                actualAvgWeight: weightSummary.latestAvgWeightKg,
                headCount: selectedBatch.current_count,
                currentActions: phase.fullGuideActions,
                actionHistory: Object.values(actionLogs),
            });

            const updatedItem = await saveAIAdjustedPhase({
                farmId,
                animalType: animalFilter,
                batchId: selectedBatch.id,
                phaseId: phase.id,
                updatedActions: aiResult.adjustedActions,
                updatedRecommendation: aiResult.aiRecommendation,
                aiReason: aiResult.reason,
                currentPhase: phase,
            });

            if (updatedItem) {
                setPhaseGuideList(prev => prev.map(p => (p.id === phase.id ? updatedItem : p)));
            }
        } catch (err) {
            console.error('[GuideScreen] handleTriggerAIAdjustment error:', err);
        } finally {
            setIsAiAdjusting(prev => ({ ...prev, [phase.id]: false }));
        }
    };

    // ─── Debug Test Push Notification Handlers ─────────────────────────────────
    const getBothSpeciesGuideData = async () => {
        let farmName = 'Farm';
        if (farmId) {
            const { data: farmData } = await supabase.from('farms').select('name').eq('id', farmId).single();
            if (farmData?.name) farmName = farmData.name;
        }

        // Fetch active batches for this farm or fallback to DEMO_BATCHES
        const { data: batchesData } = await supabase
            .from('batches')
            .select('id, farm_id, name, animal_type, arrival_date, age_at_arrival_days, housings(name, farm_id)')
            .in('status', ['active']);

        const farmBatches = (batchesData || []).filter((b: any) => b.farm_id === farmId || b.housings?.farm_id === farmId);
        const pigBatch = farmBatches.find((b: any) => b.animal_type === 'pig') || DEMO_BATCHES.find(b => b.animal_type === 'pig');
        const chickenBatch = farmBatches.find((b: any) => b.animal_type === 'chicken') || DEMO_BATCHES.find(b => b.animal_type === 'chicken');

        const calculateDay = (arrDate?: string, ageAtArr: number = 1) => {
            if (!arrDate) return 1;
            const arr = new Date(arrDate.split('T')[0]);
            const today = new Date();
            arr.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            const diff = Math.floor((today.getTime() - arr.getTime()) / (1000 * 60 * 60 * 24));
            return Math.max(1, diff + (ageAtArr || 1));
        };

        const getSpeciesInfo = async (type: 'pig' | 'chicken', batchItem: any) => {
            const day = calculateDay(batchItem?.arrival_date, batchItem?.age_at_arrival_days);
            const phases = await getEffectiveRoadmap(farmId, type, batchItem?.id);
            const phase = phases.find(p => day >= p.dayStart && day <= p.dayEnd) || phases[phases.length - 1];
            const sorted = sortActionsByDay(phase.fullGuideActions || []);
            const matched = sorted.filter(act => isDayMatching(act.dayTag, day));
            let coreAction = matched.length > 0
                ? matched[0].action
                : (phase.todayAction || phase.actionable || 'Follow standard feeding and hygiene protocol.');
            coreAction = coreAction.replace(/^Action:\s*/i, '').trim();

            let focus = (phase.todayAction || phase.actionable || 'Follow daily SOP care').replace(/^Action:\s*/i, '').trim();

            return {
                batchName: batchItem?.name || (type === 'pig' ? 'Swine Cohort' : 'Poultry Cohort'),
                day,
                phase,
                coreAction,
                focus,
            };
        };

        const pigInfo = await getSpeciesInfo('pig', pigBatch);
        const chickenInfo = await getSpeciesInfo('chicken', chickenBatch);

        return { farmName, pigInfo, chickenInfo };
    };

    const triggerTestDailyBriefing = async () => {
        try {
            const { farmName, pigInfo, chickenInfo } = await getBothSpeciesGuideData();
            const taskSummary = `Pigs (Day ${pigInfo.day}): ${pigInfo.coreAction}\n\nChickens (Day ${chickenInfo.day}): ${chickenInfo.coreAction}`;

            await createNotification({
                farmId: farmId || 'demo-farm',
                farmName,
                title: 'Good Morning! Daily Briefing',
                message: `Good morning! Check your farm and today's SOP focus:\n\n${taskSummary}\n\nTap to check your farm and view Guide.`,
                type: 'info',
                category: 'ai_suggestion',
                actionUrl: '/(guide)/GuideScreen',
            });

            Alert.alert('Push Notification Sent', 'Daily briefing push notification for both species dispatched successfully.');
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to dispatch test notification.');
        }
    };

    const triggerTestCurrentGuideAlert = async () => {
        try {
            const { farmName, pigInfo, chickenInfo } = await getBothSpeciesGuideData();
            const message = `Pigs (Day ${pigInfo.day}, ${pigInfo.phase.name}):\n${pigInfo.coreAction}\n\nChickens (Day ${chickenInfo.day}, ${chickenInfo.phase.name}):\n${chickenInfo.coreAction}\n\nTap to view Guide.`;

            await createNotification({
                farmId: farmId || 'demo-farm',
                farmName,
                title: "Guide Action: Today's SOP",
                message,
                type: 'info',
                category: 'ai_suggestion',
                actionUrl: '/(guide)/GuideScreen',
            });

            Alert.alert('Push Notification Sent', "Today's Guide SOP push notification for both species dispatched successfully.");
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to dispatch test notification.');
        }
    };

    const triggerTestPhaseTransitionAlert = async () => {
        try {
            const { farmName, pigInfo, chickenInfo } = await getBothSpeciesGuideData();
            const message = `Pigs (Day ${pigInfo.day}, ${pigInfo.phase.name}):\nTarget Temp: ${pigInfo.phase.targetTemp} | Target Weight: ${pigInfo.phase.targetWeight}\nFocus: ${pigInfo.focus}\n\nChickens (Day ${chickenInfo.day}, ${chickenInfo.phase.name}):\nTarget Temp: ${chickenInfo.phase.targetTemp} | Target Weight: ${chickenInfo.phase.targetWeight}\nFocus: ${chickenInfo.focus}\n\nTap to view Guide.`;

            await createNotification({
                farmId: farmId || 'demo-farm',
                farmName,
                title: 'Guide: Growth Phase Milestones',
                message,
                type: 'info',
                category: 'ai_suggestion',
                actionUrl: '/(guide)/GuideScreen',
            });

            Alert.alert('Push Notification Sent', 'Phase transition push notification for both species dispatched successfully.');
        } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to dispatch test notification.');
        }
    };

    const handleTestPushNotification = () => {
        Alert.alert(
            'Test Push Notification',
            'Choose a notification scenario to test (delivers for both Chickens & Pigs):',
            [
                {
                    text: 'Daily Briefing (Accurate Focus)',
                    onPress: () => {
                        triggerTestDailyBriefing();
                    },
                },
                {
                    text: 'Current Batch Guide Alert',
                    onPress: () => {
                        triggerTestCurrentGuideAlert();
                    },
                },
                {
                    text: 'Phase Transition Alert',
                    onPress: () => {
                        triggerTestPhaseTransitionAlert();
                    },
                },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgLight, paddingTop: insets.top }}>
            {/* Fixed App Header */}
            <Header />

            {/* Scrollable Main Content */}
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: hPad, paddingTop: 14, paddingBottom: 120 }}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primary}
                        colors={[colors.primary]}
                    />
                }
            >
                {/* ═══════════════════════════════════════════════════════════════════ */}
                {/* ─── SUBPAGE VIEW: FULL PRODUCTION & CARE ROADMAP ───────────────── */}
                {/* ═══════════════════════════════════════════════════════════════════ */}
                {viewMode === 'full-guide' ? (
                    <View style={{ gap: 16 }}>
                        {/* 1. Subpage Breadcrumb Navigation Bar */}
                        {/* 1. Subpage Header Bar */}
                        <View style={{
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            paddingHorizontal: 12,
                            paddingVertical: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                        }}>
                            <TouchableOpacity
                                onPress={() => setViewMode('dashboard')}
                                activeOpacity={0.7}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 10,
                                    flex: 1,
                                    marginRight: 6,
                                }}
                            >
                                <View style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 10,
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    <MaterialIcons name="arrow-back" size={18} color={colors.text} />
                                </View>

                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins-Medium', color: colors.textGrey }} numberOfLines={1}>
                                        {selectedBatch?.housings?.name || (animalFilter === 'pig' ? 'Swine Housing' : 'Broiler Housing')}
                                    </Text>
                                    <Text style={{ fontSize: 14, fontFamily: 'Poppins-Bold', color: colors.text }} numberOfLines={1}>
                                        Complete Roadmap
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <View style={{
                                paddingHorizontal: 10,
                                paddingVertical: 4,
                                borderRadius: 8,
                                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : colors.bgLight,
                                borderWidth: 1,
                                borderColor: colors.stroke,
                                maxWidth: 110,
                            }}>
                                <Text style={{ color: colors.primary, fontFamily: 'Poppins-Bold', fontSize: 11 }} numberOfLines={1}>
                                    {selectedBatch?.name || (animalFilter === 'pig' ? 'Swine Cohort' : 'Broiler Cohort')}
                                </Text>
                            </View>
                        </View>

                        {/* 2. Hero Header for Full Roadmap Subpage */}
                        <View style={{
                            backgroundColor: colors.surface,
                            borderRadius: 18,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            padding: 18,
                            gap: 12,
                        }}>
                            <View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                    <Text style={[textStyles.h2, { fontSize: 18, fontFamily: 'Poppins-Bold', color: colors.text }]}>
                                        {animalFilter === 'pig' ? 'Complete Swine Roadmap' : 'Complete Poultry Roadmap'}
                                    </Text>
                                    {isRoadmapLoading && (
                                        <Text style={{ fontSize: 11, color: colors.primary, fontFamily: 'Poppins-Bold' }}>
                                            • Syncing DB...
                                        </Text>
                                    )}
                                </View>
                                <Text style={[textStyles.body, { fontSize: 12.5, color: colors.textGrey, marginTop: 4, lineHeight: 18 }]}>
                                    Standard Operating Procedures, climate management, and AI dynamic adjustments based on real-time scale performance.
                                </Text>
                            </View>

                            {/* 4 Summary Chips */}
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                <View style={{ flex: 1, minWidth: '45%', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB', borderWidth: 1, borderColor: colors.stroke, borderRadius: 10, padding: 10 }}>
                                    <Text style={{ fontSize: 9.5, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Lifecycle Duration</Text>
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins-Bold', color: colors.text, marginTop: 2 }}>
                                        {availablePhases.length}/{phaseGuideList.length} Phases ({totalBenchmarkDays}d)
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: '45%', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB', borderWidth: 1, borderColor: colors.stroke, borderRadius: 10, padding: 10 }}>
                                    <Text style={{ fontSize: 9.5, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Active Stage</Text>
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins-Bold', color: colors.primary, marginTop: 2 }}>
                                        Day {currentDay} ({naturalPhase.name.replace(' Phase', '')})
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: '45%', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB', borderWidth: 1, borderColor: colors.stroke, borderRadius: 10, padding: 10 }}>
                                    <Text style={{ fontSize: 9.5, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Target Weight</Text>
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins-Bold', color: colors.text, marginTop: 2 }}>
                                        {naturalPhase.targetWeight}
                                    </Text>
                                </View>
                                <View style={{ flex: 1, minWidth: '45%', backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB', borderWidth: 1, borderColor: colors.stroke, borderRadius: 10, padding: 10 }}>
                                    <Text style={{ fontSize: 9.5, color: colors.textGrey, fontFamily: 'Poppins-Bold', textTransform: 'uppercase' }}>Target Temp</Text>
                                    <Text style={{ fontSize: 12.5, fontFamily: 'Poppins-Bold', color: colors.text, marginTop: 2 }}>
                                        {naturalPhase.targetTemp}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* 3. Roadmap Phase Filter Navigation Tabs */}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => setRoadmapPhaseFilter('all')}
                                style={{
                                    paddingHorizontal: 16,
                                    paddingVertical: 7,
                                    borderRadius: 20,
                                    backgroundColor: roadmapPhaseFilter === 'all' ? colors.primary : colors.surface,
                                    borderWidth: 1,
                                    borderColor: roadmapPhaseFilter === 'all' ? colors.primary : colors.stroke,
                                }}
                            >
                                <Text style={{ fontSize: 12.5, fontFamily: 'Poppins-Medium', color: roadmapPhaseFilter === 'all' ? colors.onPrimary : colors.textGrey }}>
                                    All Phases ({availablePhases.length})
                                </Text>
                            </TouchableOpacity>

                            {availablePhases.map((phase, idx) => {
                                const isSelected = roadmapPhaseFilter === phase.id;
                                const isCurrent = idx === naturalPhaseIndex;
                                return (
                                    <TouchableOpacity
                                        key={phase.id}
                                        activeOpacity={0.7}
                                        onPress={() => setRoadmapPhaseFilter(phase.id)}
                                        style={{
                                            paddingHorizontal: 16,
                                            paddingVertical: 7,
                                            borderRadius: 20,
                                            backgroundColor: isSelected ? colors.primary : colors.surface,
                                            borderWidth: 1,
                                            borderColor: isSelected ? colors.primary : isCurrent ? colors.warning : colors.stroke,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        {isCurrent && (
                                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isSelected ? colors.onPrimary : colors.warning }} />
                                        )}
                                        <Text style={{ fontSize: 12.5, fontFamily: 'Poppins-Medium', color: isSelected ? colors.onPrimary : colors.text }}>
                                            {phase.name.replace(' Phase', '')}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        {/* 4. Filtered Phase List with Done Phase Collapsing */}
                        <View style={{ gap: 14 }}>
                            {filteredRoadmapPhases.map((phase) => {
                                const phaseIdx = phaseGuideList.findIndex(p => p.id === phase.id);
                                const isPast = naturalPhaseIndex >= 0 && phaseIdx < naturalPhaseIndex;
                                const isCurrentStage = naturalPhaseIndex >= 0 && phaseIdx === naturalPhaseIndex;
                                const isOpen = isPhaseOpen(phase, isPast);

                                const actual = weightSummary.latestAvgWeightKg;
                                const hasScaleData = actual !== null && actual !== undefined;
                                const minTarget = phase.targetWeightMin ?? (animalFilter === 'pig' ? 6 : 0.2);
                                const maxTarget = phase.targetWeightMax ?? (animalFilter === 'pig' ? 18 : 0.48);

                                const isBelowTarget = hasScaleData && actual < minTarget;
                                const isAboveTarget = hasScaleData && actual > maxTarget;
                                const isOnTrack = hasScaleData && !isBelowTarget && !isAboveTarget;
                                const isAdjusting = isAiAdjusting[phase.id] === true;

                                return (
                                    <View
                                        key={phase.id}
                                        style={{
                                            backgroundColor: colors.surface,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: isCurrentStage ? colors.warning : colors.stroke,
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {/* Phase Header (Tap to toggle collapse) */}
                                        <TouchableOpacity
                                            activeOpacity={0.8}
                                            onPress={() => togglePhaseCollapse(phase.id)}
                                            style={{
                                                padding: 16,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                backgroundColor: isCurrentStage ? colors.warning + '08' : isPast ? (isDark ? 'rgba(255,255,255,0.02)' : '#FAFAFA') : colors.surface,
                                                borderBottomWidth: isOpen ? 1 : 0,
                                                borderBottomColor: colors.stroke,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                                                {/* Status Indicator Icon */}
                                                <View style={{
                                                    width: 26,
                                                    height: 26,
                                                    borderRadius: 13,
                                                    backgroundColor: isPast ? colors.primary : isCurrentStage ? colors.warning : colors.inputFill,
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}>
                                                    {isPast && <MaterialIcons name="check" size={16} color="#FFF" />}
                                                    {isCurrentStage && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />}
                                                    {!isPast && !isCurrentStage && (
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins-Bold', color: colors.textGrey }}>
                                                            {phaseIdx + 1}
                                                        </Text>
                                                    )}
                                                </View>

                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                        <Text style={[textStyles.h3, { fontSize: 15, fontFamily: 'Poppins-Bold', color: isCurrentStage ? colors.warning : colors.text }]}>
                                                            {phase.name}
                                                        </Text>
                                                        <View style={{
                                                            backgroundColor: isCurrentStage ? colors.warning + '1A' : (isDark ? 'rgba(255,255,255,0.06)' : colors.bgLight),
                                                            paddingHorizontal: 7,
                                                            paddingVertical: 1,
                                                            borderRadius: 5,
                                                        }}>
                                                            <Text style={{ color: isCurrentStage ? colors.warning : colors.textGrey, fontSize: 10, fontFamily: 'Poppins-Bold' }}>
                                                                {phase.dayRange}
                                                            </Text>
                                                        </View>
                                                        {isPast && (
                                                            <View style={{ backgroundColor: colors.primary + '18', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 }}>
                                                                <Text style={{ color: colors.primary, fontSize: 9.5, fontFamily: 'Poppins-Bold' }}>
                                                                    DONE
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {phase.is_ai_adjusted && (
                                                            <View style={{ backgroundColor: '#6C63FF1A', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 }}>
                                                                <Text style={{ color: '#6C63FF', fontSize: 9.5, fontFamily: 'Poppins-Bold' }}>
                                                                    AI v{phase.version ?? 2}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>

                                                    <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Regular', marginTop: 2 }}>
                                                        Target: {phase.targetWeight} • {phase.targetTemp}
                                                    </Text>
                                                </View>
                                            </View>

                                            <MaterialIcons
                                                name={isOpen ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                                                size={24}
                                                color={colors.textGrey}
                                            />
                                        </TouchableOpacity>

                                        {/* Collapsible Body */}
                                        {isOpen && (
                                            <View style={{ padding: 16, gap: 12 }}>
                                                <Text style={[textStyles.body, { fontSize: 12.5, color: colors.textGrey, lineHeight: 18 }]}>
                                                    {phase.timelineDescription}
                                                </Text>

                                                {/* Live Performance & AI Adjustment Banner (Active on current stage) */}
                                                {isCurrentStage && (
                                                    <View style={{
                                                        backgroundColor: isBelowTarget ? '#EF444415' : '#10B98115',
                                                        borderWidth: 1,
                                                        borderColor: isBelowTarget ? '#EF444445' : '#10B98145',
                                                        borderRadius: 12,
                                                        padding: 12,
                                                        gap: 8,
                                                    }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                <MaterialIcons
                                                                    name={isBelowTarget ? 'warning-amber' : isOnTrack ? 'check-circle' : isAboveTarget ? 'trending-up' : 'scale'}
                                                                    size={16}
                                                                    color={isBelowTarget ? '#EF4444' : '#10B981'}
                                                                />
                                                                <Text style={{
                                                                    fontSize: 11.5,
                                                                    fontFamily: 'Poppins-Bold',
                                                                    color: isBelowTarget ? '#EF4444' : '#10B981',
                                                                }}>
                                                                    {isOnTrack && `On Track (${actual} kg)`}
                                                                    {isBelowTarget && `Below Target (${actual} kg vs ${phase.targetWeight})`}
                                                                    {isAboveTarget && `Ahead of Schedule (${actual} kg)`}
                                                                    {!hasScaleData && 'Ready for Scale Logs'}
                                                                </Text>
                                                            </View>

                                                            {/* AI Adjustment Action Trigger Button */}
                                                            <TouchableOpacity
                                                                onPress={() => handleTriggerAIAdjustment(phase)}
                                                                disabled={isAdjusting}
                                                                style={{
                                                                    paddingHorizontal: 10,
                                                                    paddingVertical: 5,
                                                                    borderRadius: 8,
                                                                    backgroundColor: colors.primary,
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                    opacity: isAdjusting ? 0.6 : 1,
                                                                }}
                                                            >
                                                                {isAdjusting ? (
                                                                    <ActivityIndicator size="small" color={colors.onPrimary} />
                                                                ) : (
                                                                    <MaterialIcons name="bolt" size={14} color={colors.onPrimary} />
                                                                )}
                                                                <Text style={{ color: colors.onPrimary, fontSize: 11, fontFamily: 'Poppins-Bold' }}>
                                                                    {isAdjusting ? 'Aligning AI...' : phase.is_ai_adjusted ? 'Re-Optimize' : 'Optimize with AniBot'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        </View>

                                                        <Text style={[textStyles.body, { fontSize: 12, color: colors.text, lineHeight: 17 }]}>
                                                            {phase.ai_reason || phase.aiRecommendation}
                                                        </Text>
                                                    </View>
                                                )}

                                                {/* 3 Pillar Protocol Cards */}
                                                <View style={{ gap: 8 }}>
                                                    {phase.actionDetails.map((detail, dIdx) => (
                                                        <View
                                                            key={dIdx}
                                                            style={{
                                                                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FAFAFA',
                                                                borderRadius: 10,
                                                                borderWidth: 1,
                                                                borderColor: colors.stroke,
                                                                padding: 10,
                                                                gap: 3,
                                                            }}
                                                        >
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                <MaterialIcons name={mapIconName(detail.icon)} size={15} color={colors.primary} />
                                                                <Text style={[textStyles.h3, { fontSize: 12, fontFamily: 'Poppins-Bold', color: colors.text }]}>
                                                                    {detail.label}
                                                                </Text>
                                                            </View>
                                                            <Text style={[textStyles.body, { fontSize: 11.5, color: colors.textGrey, lineHeight: 16 }]}>
                                                                {detail.text}
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>

                                                {/* Full Action Procedures (Sorted Chronologically) */}
                                                <View style={{ gap: 8, marginTop: 4 }}>
                                                    <Text style={{ fontSize: 10.5, fontFamily: 'Poppins-Bold', color: colors.textGrey, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                                        Standard Operating Procedures (SOP) & Actions
                                                    </Text>

                                                    <View style={{ gap: 8 }}>
                                                        {sortActionsByDay(phase.fullGuideActions).map((actionItem, aIdx) => {
                                                            const isAIItem = typeof actionItem.action === 'string' && actionItem.action.startsWith('[AI Adjustment]');
                                                            const isTodayItem = isCurrentStage && isDayMatching(actionItem.dayTag, currentDay);
                                                            const taskDay = isTodayItem ? currentDay : (phase.dayStart || 1);
                                                            const logKey = getActionLogKey(phase.id, actionItem.action, taskDay);
                                                            const actionLog = actionLogs[logKey];
                                                            const isCompleted = actionLog?.status === 'completed';
                                                            const isRejected = actionLog?.status === 'rejected';

                                                            return (
                                                                <View
                                                                    key={aIdx}
                                                                    style={{
                                                                        borderRadius: 12,
                                                                        backgroundColor: isCompleted
                                                                            ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4')
                                                                            : isRejected
                                                                                ? (isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB')
                                                                                : isAIItem
                                                                                    ? (isDark ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5')
                                                                                    : (isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF'),
                                                                        borderWidth: 1,
                                                                        borderColor: isCompleted
                                                                            ? 'rgba(16, 185, 129, 0.5)'
                                                                            : isRejected
                                                                                ? 'rgba(245, 158, 11, 0.5)'
                                                                                : isAIItem
                                                                                    ? 'rgba(16, 185, 129, 0.4)'
                                                                                    : isTodayItem
                                                                                        ? 'rgba(16, 185, 129, 0.3)'
                                                                                        : colors.stroke,
                                                                        borderLeftWidth: (isCompleted || isRejected) ? 4 : 1,
                                                                        borderLeftColor: isCompleted ? '#10B981' : isRejected ? '#F59E0B' : undefined,
                                                                        padding: 12,
                                                                        gap: 10,
                                                                    }}
                                                                >
                                                                    {/* Top Row: Task Description & Day Badge */}
                                                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                                                        <View style={{ flex: 1 }}>
                                                                            <Text style={{
                                                                                fontSize: 12.5,
                                                                                color: isCompleted ? (isDark ? '#34D399' : '#065F46') : isRejected ? (isDark ? '#FBBF24' : '#92400E') : isAIItem ? '#10B981' : colors.text,
                                                                                fontFamily: isAIItem || isTodayItem || isCompleted ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                                                lineHeight: 18,
                                                                            }}>
                                                                                {actionItem.action}
                                                                            </Text>
                                                                        </View>

                                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                                                            {isTodayItem && (
                                                                                <View style={{
                                                                                    backgroundColor: 'rgba(16, 185, 129, 0.18)',
                                                                                    borderWidth: 1,
                                                                                    borderColor: 'rgba(16, 185, 129, 0.3)',
                                                                                    paddingHorizontal: 6,
                                                                                    paddingVertical: 1.5,
                                                                                    borderRadius: 4,
                                                                                }}>
                                                                                    <Text style={{ fontSize: 9, fontFamily: 'Poppins-Bold', color: '#10B981' }}>
                                                                                        TODAY
                                                                                    </Text>
                                                                                </View>
                                                                            )}
                                                                            <View style={{
                                                                                backgroundColor: isAIItem || isTodayItem ? 'rgba(16, 185, 129, 0.15)' : (isDark ? 'rgba(255,255,255,0.05)' : colors.bgLight),
                                                                                borderWidth: 1,
                                                                                borderColor: isAIItem || isTodayItem ? 'rgba(16, 185, 129, 0.35)' : colors.stroke,
                                                                                paddingHorizontal: 7,
                                                                                paddingVertical: 2,
                                                                                borderRadius: 6,
                                                                            }}>
                                                                                <Text style={{ fontSize: 10, fontFamily: 'Poppins-Bold', color: isAIItem || isTodayItem ? '#10B981' : colors.textGrey }}>
                                                                                    {actionItem.dayTag}
                                                                                </Text>
                                                                            </View>
                                                                        </View>
                                                                    </View>

                                                                    {/* Skipped Note Reason display */}
                                                                    {isRejected && actionLog?.reason_notes && (
                                                                        <View style={{
                                                                            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
                                                                            borderRadius: 8,
                                                                            paddingHorizontal: 10,
                                                                            paddingVertical: 6,
                                                                            flexDirection: 'row',
                                                                            alignItems: 'center',
                                                                            gap: 6,
                                                                        }}>
                                                                            <MaterialIcons name="comment" size={13} color="#F59E0B" />
                                                                            <Text style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#B45309', fontFamily: 'Poppins-Medium', flex: 1 }} numberOfLines={2}>
                                                                                Note: "{actionLog.reason_notes}"
                                                                            </Text>
                                                                        </View>
                                                                    )}

                                                                    {/* Bottom Action Buttons Row */}
                                                                    <View style={{
                                                                        flexDirection: 'row',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'space-between',
                                                                        paddingTop: 6,
                                                                        borderTopWidth: 1,
                                                                        borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                                                    }}>
                                                                        {isCompleted ? (
                                                                            <>
                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                                                    <MaterialIcons name="check-circle" size={15} color="#10B981" />
                                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-Bold', color: '#10B981' }}>
                                                                                        Action Completed
                                                                                    </Text>
                                                                                </View>

                                                                                <TouchableOpacity
                                                                                    activeOpacity={0.7}
                                                                                    onPress={() => handleUndoAction(actionItem, phase.id, taskDay)}
                                                                                    style={{
                                                                                        flexDirection: 'row',
                                                                                        alignItems: 'center',
                                                                                        gap: 4,
                                                                                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.bgLight,
                                                                                        borderWidth: 1,
                                                                                        borderColor: colors.stroke,
                                                                                        paddingHorizontal: 10,
                                                                                        paddingVertical: 5,
                                                                                        borderRadius: 8,
                                                                                    }}
                                                                                >
                                                                                    <MaterialIcons name="undo" size={13} color={colors.textGrey} />
                                                                                    <Text style={{ fontSize: 11, fontFamily: 'Poppins-Medium', color: colors.textGrey }}>
                                                                                        Undo
                                                                                    </Text>
                                                                                </TouchableOpacity>
                                                                            </>
                                                                        ) : isRejected ? (
                                                                            <>
                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                                                    <MaterialIcons name="cancel" size={15} color="#F59E0B" />
                                                                                    <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-Bold', color: '#F59E0B' }}>
                                                                                        Skipped / Rejected
                                                                                    </Text>
                                                                                </View>

                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                                    <TouchableOpacity
                                                                                        activeOpacity={0.7}
                                                                                        onPress={() => handleOpenSkipModal(actionItem, phase.id, taskDay)}
                                                                                        style={{
                                                                                            flexDirection: 'row',
                                                                                            alignItems: 'center',
                                                                                            gap: 4,
                                                                                            backgroundColor: '#F59E0B',
                                                                                            paddingHorizontal: 10,
                                                                                            paddingVertical: 5,
                                                                                            borderRadius: 8,
                                                                                        }}
                                                                                    >
                                                                                        <MaterialIcons name="edit" size={12} color="#FFFFFF" />
                                                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }}>
                                                                                            Edit Note
                                                                                        </Text>
                                                                                    </TouchableOpacity>

                                                                                    <TouchableOpacity
                                                                                        activeOpacity={0.7}
                                                                                        onPress={() => handleUndoAction(actionItem, phase.id, taskDay)}
                                                                                        style={{
                                                                                            flexDirection: 'row',
                                                                                            alignItems: 'center',
                                                                                            gap: 3,
                                                                                            paddingHorizontal: 8,
                                                                                            paddingVertical: 5,
                                                                                            borderRadius: 8,
                                                                                            borderWidth: 1,
                                                                                            borderColor: colors.stroke,
                                                                                            backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.bgLight,
                                                                                        }}
                                                                                    >
                                                                                        <MaterialIcons name="refresh" size={13} color={colors.textGrey} />
                                                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins-Medium', color: colors.textGrey }}>
                                                                                            Reset
                                                                                        </Text>
                                                                                    </TouchableOpacity>
                                                                                </View>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins-Regular', color: colors.textGrey }}>
                                                                                    Record procedure:
                                                                                </Text>

                                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                                                    <TouchableOpacity
                                                                                        activeOpacity={0.7}
                                                                                        onPress={() => handleOpenSkipModal(actionItem, phase.id, taskDay)}
                                                                                        style={{
                                                                                            flexDirection: 'row',
                                                                                            alignItems: 'center',
                                                                                            gap: 4,
                                                                                            paddingHorizontal: 12,
                                                                                            paddingVertical: 6,
                                                                                            borderRadius: 8,
                                                                                            borderWidth: 1,
                                                                                            borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
                                                                                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
                                                                                        }}
                                                                                    >
                                                                                        <MaterialIcons name="close" size={14} color="#EF4444" />
                                                                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-SemiBold', color: '#EF4444' }}>
                                                                                            Skip
                                                                                        </Text>
                                                                                    </TouchableOpacity>

                                                                                    <TouchableOpacity
                                                                                        activeOpacity={0.8}
                                                                                        onPress={() => handleCompleteAction(actionItem, phase.id, taskDay)}
                                                                                        style={{
                                                                                            flexDirection: 'row',
                                                                                            alignItems: 'center',
                                                                                            gap: 4,
                                                                                            paddingHorizontal: 14,
                                                                                            paddingVertical: 6,
                                                                                            borderRadius: 8,
                                                                                            backgroundColor: '#10B981',
                                                                                        }}
                                                                                    >
                                                                                        <MaterialIcons name="check" size={14} color="#FFFFFF" />
                                                                                        <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }}>
                                                                                            Done
                                                                                        </Text>
                                                                                    </TouchableOpacity>
                                                                                </View>
                                                                            </>
                                                                        )}
                                                                    </View>
                                                                </View>
                                                            );
                                                        })}
                                                    </View>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                ) : (
                    /* ═══════════════════════════════════════════════════════════════ */
                    /* ─── MAIN DASHBOARD VIEW ───────────────────────────────────────── */
                    /* ═══════════════════════════════════════════════════════════════ */
                    <View>
                        {/* 1. Header Section */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <View style={{ flex: 1, marginRight: 10 }}>
                                <Text style={[textStyles.h1, { color: colors.text, fontSize: 30 }]}>
                                    Actionable Guide
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14, marginTop: 4 }]}>
                                    Track growth timelines and best practices
                                </Text>
                            </View>

                            {/* Debugging Button for Push Notification */}
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={handleTestPushNotification}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 5,
                                    paddingHorizontal: 12,
                                    paddingVertical: 7,
                                    borderRadius: 10,
                                    backgroundColor: '#EF4444',
                                    borderWidth: 1,
                                    borderColor: '#DC2626',
                                    marginTop: 4,
                                    elevation: 2,
                                    shadowColor: '#EF4444',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.25,
                                    shadowRadius: 3,
                                }}
                            >
                                <MaterialIcons name="notifications-active" size={16} color="#FFFFFF" />
                                <Text style={{ fontSize: 12, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }}>
                                    Test Push
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* 2. Animal Tab Filter (AniGrow standard pills) */}
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                            {(['pig', 'chicken'] as const).map((filter) => {
                                const isSelected = animalFilter === filter;
                                return (
                                    <TouchableOpacity
                                        key={filter}
                                        activeOpacity={0.7}
                                        onPress={() => setAnimalFilter(filter)}
                                        style={{
                                            paddingHorizontal: 20,
                                            paddingVertical: 8,
                                            borderRadius: 20,
                                            backgroundColor: isSelected ? colors.primary : colors.surface,
                                            borderWidth: 1,
                                            borderColor: isSelected ? colors.primary : colors.stroke,
                                        }}
                                    >
                                        <Text style={{
                                            fontFamily: 'Poppins-Medium',
                                            fontSize: 13,
                                            color: isSelected ? colors.onPrimary : colors.textGrey,
                                        }}>
                                            {filter === 'pig' ? 'Pigs' : 'Chickens'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>


                        {/* 3. Batch Filter Dropdown */}
                        {isBatchLoading ? (
                            <View style={{ paddingBottom: 12 }}>
                                <ActivityIndicator size="small" color={colors.primary} />
                            </View>
                        ) : allBatchesForType.length > 0 ? (
                            <View style={{ marginBottom: 16 }}>
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
                                        shadowOpacity: 0.1,
                                        shadowRadius: 2,
                                    }}
                                    onPress={() => setIsBatchModalVisible(true)}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                                        <MaterialIcons name="layers" size={20} color={colors.textGrey} style={{ marginRight: 10 }} />
                                        <Text style={[textStyles.body, { color: colors.text, fontSize: 13.5 }]} numberOfLines={1}>
                                            {selectedBatchLabel}
                                        </Text>
                                    </View>
                                    <MaterialIcons name="arrow-drop-down" size={24} color={colors.textGrey} />
                                </TouchableOpacity>
                            </View>
                        ) : null}

                        {/* 4. Real Day + Phase Header Card */}
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
                            shadowOpacity: 0.08,
                            shadowRadius: 8,
                            elevation: 2,
                            marginBottom: 20,
                        }}>
                            <View style={{ flex: 1, marginRight: 14 }}>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 19, marginBottom: 4 }]}>
                                    {animalFilter === 'pig' ? 'Swine' : 'Poultry'} Timeline
                                </Text>
                                {selectedBatch ? (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20 }]}>
                                        <Text style={{ fontFamily: 'Poppins-SemiBold', color: colors.text }}>
                                            {selectedBatch.name}
                                        </Text>
                                        {' '}is in{' '}
                                        <Text style={{ fontFamily: 'Poppins-Bold', color: colors.primary }}>
                                            {naturalPhase.name}
                                        </Text>
                                        . Steps below are tailored for today.
                                    </Text>
                                ) : (
                                    <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20 }]}>
                                        Select a batch above to see real-time guidance.
                                    </Text>
                                )}
                            </View>

                            {/* Day Badge */}
                            <View style={{
                                backgroundColor: colors.primary + '18',
                                paddingHorizontal: 16,
                                paddingVertical: 10,
                                borderRadius: 12,
                                alignItems: 'center',
                                minWidth: 64,
                            }}>
                                <Text style={{ color: colors.primary, fontSize: 10, letterSpacing: 1.2, fontFamily: 'Poppins-Bold' }}>
                                    DAY
                                </Text>
                                <Text style={{ color: colors.primary, fontSize: 26, fontFamily: 'Poppins-Bold', lineHeight: 28 }}>
                                    {currentDay}
                                </Text>
                            </View>
                        </View>

                        {/* 5. Core Today's Action Banner */}
                        <View style={{
                            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.06)' : '#F0FDF4',
                            borderWidth: 1.2,
                            borderColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#BBF7D0',
                            borderRadius: 14,
                            padding: 14,
                            marginBottom: 20,
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            gap: 12,
                        }}>
                            <View style={{
                                width: 34,
                                height: 34,
                                borderRadius: 8,
                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}>
                                <MaterialIcons name="lightbulb" size={18} color="#10B981" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 10, fontFamily: 'Poppins-Bold', color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Core Action Focus • {naturalPhase.name}
                                </Text>
                                <Text style={{ fontSize: 13, fontFamily: 'Poppins-SemiBold', color: colors.text, marginTop: 2, lineHeight: 18 }}>
                                    {naturalPhase.todayAction}
                                </Text>
                            </View>
                        </View>

                        {/* 6. Today's Suggested Tasks */}
                        <View style={{
                            backgroundColor: colors.surface,
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            padding: 16,
                            marginBottom: 20,
                        }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <MaterialIcons name="format-list-bulleted" size={18} color={colors.primary} />
                                    <Text style={[textStyles.h3, { fontSize: 15, fontFamily: 'Poppins-Bold', color: colors.text }]}>
                                        Today's Suggested Tasks
                                    </Text>
                                </View>
                                <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Medium' }}>
                                    Day {currentDay}
                                </Text>
                            </View>

                            <View style={{ gap: 8 }}>
                                {todayTasksForCurrentPhase.map((actionItem, idx) => {
                                    const isAIItem = typeof actionItem.action === 'string' && actionItem.action.startsWith('[AI Adjustment]');
                                    const isTodayMatched = isDayMatching(actionItem.dayTag, currentDay);
                                    const logKey = getActionLogKey(naturalPhase.id, actionItem.action, currentDay);
                                    const actionLog = actionLogs[logKey];
                                    const isCompleted = actionLog?.status === 'completed';
                                    const isRejected = actionLog?.status === 'rejected';

                                    return (
                                        <View
                                            key={idx}
                                            style={{
                                                borderRadius: 12,
                                                backgroundColor: isCompleted
                                                    ? (isDark ? 'rgba(16, 185, 129, 0.12)' : '#F0FDF4')
                                                    : isRejected
                                                        ? (isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB')
                                                        : isAIItem
                                                            ? (isDark ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5')
                                                            : (isDark ? 'rgba(255,255,255,0.02)' : '#FAFAFA'),
                                                borderWidth: 1,
                                                borderColor: isCompleted
                                                    ? 'rgba(16, 185, 129, 0.5)'
                                                    : isRejected
                                                        ? 'rgba(245, 158, 11, 0.5)'
                                                        : isAIItem
                                                            ? 'rgba(16, 185, 129, 0.45)'
                                                            : isTodayMatched
                                                                ? 'rgba(16, 185, 129, 0.35)'
                                                                : colors.stroke,
                                                borderLeftWidth: (isCompleted || isRejected) ? 4 : 1,
                                                borderLeftColor: isCompleted ? '#10B981' : isRejected ? '#F59E0B' : undefined,
                                                padding: 12,
                                                gap: 10,
                                            }}
                                        >
                                            {/* Top Row: Task Description & Day Badge */}
                                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{
                                                        fontSize: 12.5,
                                                        color: isCompleted ? (isDark ? '#34D399' : '#065F46') : isRejected ? (isDark ? '#FBBF24' : '#92400E') : isAIItem ? '#10B981' : colors.text,
                                                        fontFamily: isAIItem || isTodayMatched || isCompleted ? 'Poppins-SemiBold' : 'Poppins-Regular',
                                                        lineHeight: 18,
                                                    }}>
                                                        {actionItem.action}
                                                    </Text>
                                                </View>

                                                <View style={{
                                                    backgroundColor: isAIItem || isTodayMatched ? 'rgba(16, 185, 129, 0.15)' : (isDark ? 'rgba(255,255,255,0.05)' : colors.bgLight),
                                                    borderWidth: 1,
                                                    borderColor: isAIItem || isTodayMatched ? 'rgba(16, 185, 129, 0.35)' : colors.stroke,
                                                    paddingHorizontal: 7,
                                                    paddingVertical: 2,
                                                    borderRadius: 6,
                                                    flexShrink: 0,
                                                }}>
                                                    <Text style={{ fontSize: 10, fontFamily: 'Poppins-Bold', color: isAIItem || isTodayMatched ? '#10B981' : colors.textGrey }}>
                                                        {actionItem.dayTag}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Skipped Note Reason display */}
                                            {isRejected && actionLog?.reason_notes && (
                                                <View style={{
                                                    backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
                                                    borderRadius: 8,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 6,
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                }}>
                                                    <MaterialIcons name="comment" size={13} color="#F59E0B" />
                                                    <Text style={{ fontSize: 11, color: isDark ? '#FCD34D' : '#B45309', fontFamily: 'Poppins-Medium', flex: 1 }} numberOfLines={2}>
                                                        Note: "{actionLog.reason_notes}"
                                                    </Text>
                                                </View>
                                            )}

                                            {/* Bottom Action Buttons Row */}
                                            <View style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                paddingTop: 6,
                                                borderTopWidth: 1,
                                                borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                                            }}>
                                                {isCompleted ? (
                                                    <>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                            <MaterialIcons name="check-circle" size={15} color="#10B981" />
                                                            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-Bold', color: '#10B981' }}>
                                                                Action Completed
                                                            </Text>
                                                        </View>

                                                        <TouchableOpacity
                                                            activeOpacity={0.7}
                                                            onPress={() => handleUndoAction(actionItem, naturalPhase.id, currentDay)}
                                                            style={{
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                gap: 4,
                                                                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.bgLight,
                                                                borderWidth: 1,
                                                                borderColor: colors.stroke,
                                                                paddingHorizontal: 10,
                                                                paddingVertical: 5,
                                                                borderRadius: 8,
                                                            }}
                                                        >
                                                            <MaterialIcons name="undo" size={13} color={colors.textGrey} />
                                                            <Text style={{ fontSize: 11, fontFamily: 'Poppins-Medium', color: colors.textGrey }}>
                                                                Undo
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </>
                                                ) : isRejected ? (
                                                    <>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                                            <MaterialIcons name="cancel" size={15} color="#F59E0B" />
                                                            <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-Bold', color: '#F59E0B' }}>
                                                                Skipped / Rejected
                                                            </Text>
                                                        </View>

                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <TouchableOpacity
                                                                activeOpacity={0.7}
                                                                onPress={() => handleOpenSkipModal(actionItem, naturalPhase.id, currentDay)}
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                    backgroundColor: '#F59E0B',
                                                                    paddingHorizontal: 10,
                                                                    paddingVertical: 5,
                                                                    borderRadius: 8,
                                                                }}
                                                            >
                                                                <MaterialIcons name="edit" size={12} color="#FFFFFF" />
                                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }}>
                                                                    Edit Note
                                                                </Text>
                                                            </TouchableOpacity>

                                                            <TouchableOpacity
                                                                activeOpacity={0.7}
                                                                onPress={() => handleUndoAction(actionItem, naturalPhase.id, currentDay)}
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    gap: 3,
                                                                    paddingHorizontal: 8,
                                                                    paddingVertical: 5,
                                                                    borderRadius: 8,
                                                                    borderWidth: 1,
                                                                    borderColor: colors.stroke,
                                                                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.bgLight,
                                                                }}
                                                            >
                                                                <MaterialIcons name="refresh" size={13} color={colors.textGrey} />
                                                                <Text style={{ fontSize: 11, fontFamily: 'Poppins-Medium', color: colors.textGrey }}>
                                                                    Reset
                                                                </Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Text style={{ fontSize: 11, fontFamily: 'Poppins-Regular', color: colors.textGrey }}>
                                                            Record procedure:
                                                        </Text>

                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                            <TouchableOpacity
                                                                activeOpacity={0.7}
                                                                onPress={() => handleOpenSkipModal(actionItem, naturalPhase.id, currentDay)}
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                    paddingHorizontal: 12,
                                                                    paddingVertical: 6,
                                                                    borderRadius: 8,
                                                                    borderWidth: 1,
                                                                    borderColor: isDark ? 'rgba(239, 68, 68, 0.4)' : '#FCA5A5',
                                                                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2',
                                                                }}
                                                            >
                                                                <MaterialIcons name="close" size={14} color="#EF4444" />
                                                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-SemiBold', color: '#EF4444' }}>
                                                                    Skip
                                                                </Text>
                                                            </TouchableOpacity>

                                                            <TouchableOpacity
                                                                activeOpacity={0.8}
                                                                onPress={() => handleCompleteAction(actionItem, naturalPhase.id, currentDay)}
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                    paddingHorizontal: 14,
                                                                    paddingVertical: 6,
                                                                    borderRadius: 8,
                                                                    backgroundColor: '#10B981',
                                                                }}
                                                            >
                                                                <MaterialIcons name="check" size={14} color="#FFFFFF" />
                                                                <Text style={{ fontSize: 11.5, fontFamily: 'Poppins-Bold', color: '#FFFFFF' }}>
                                                                    Done
                                                                </Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>

                        {/* 7. Full Roadmap Quick Action Button */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setViewMode('full-guide')}
                            style={{
                                backgroundColor: colors.primary,
                                borderRadius: 14,
                                paddingVertical: 13,
                                paddingHorizontal: 16,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                marginBottom: 24,
                            }}
                        >
                            <Text style={{ fontSize: 13.5, fontFamily: 'Poppins-Bold', color: colors.onPrimary }}>
                                View Full Guide & Complete Roadmap
                            </Text>
                            <MaterialIcons name="arrow-forward" size={18} color={colors.onPrimary} />
                        </TouchableOpacity>

                        {/* 8. RESTORED OLD GROWTH PHASES VERTICAL TIMELINE DESIGN */}
                        <View style={{ marginBottom: 20 }}>
                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 16 }]}>
                                Growth Phases
                            </Text>

                            <View>
                                {phaseGuideList.map((phase, index) => {
                                    const isPast = naturalPhaseIndex >= 0 && index < naturalPhaseIndex;
                                    const isCurrent = naturalPhaseIndex >= 0 && index === naturalPhaseIndex;
                                    const isFuture = naturalPhaseIndex < 0 || index > naturalPhaseIndex;

                                    const circleColor = isPast ? colors.primary : isCurrent ? colors.warning : colors.surface;
                                    const borderColor = isPast ? colors.primary : isCurrent ? colors.warning : colors.stroke;
                                    const titleColor = isCurrent ? colors.warning : colors.text;

                                    return (
                                        <View key={phase.id} style={{ flexDirection: 'row', marginBottom: index === phaseGuideList.length - 1 ? 0 : 20 }}>
                                            {/* Timeline Line/Dots */}
                                            <View style={{ width: 32, alignItems: 'center', marginRight: 14 }}>
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
                                                    {isPast && <MaterialIcons name="check" size={14} color="#FFF" />}
                                                    {isCurrent && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />}
                                                </View>

                                                {index < phaseGuideList.length - 1 && (
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
                                            <View style={{ flex: 1, opacity: isFuture && naturalPhaseIndex >= 0 ? 0.65 : 1, paddingBottom: 8 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                                    <Text style={[textStyles.h2, { color: titleColor, fontSize: 17, fontFamily: 'Poppins-Bold' }]}>
                                                        {phase.name}
                                                    </Text>
                                                </View>

                                                <View style={{
                                                    alignSelf: 'flex-start',
                                                    backgroundColor: isCurrent ? colors.warning + '1A' : (isDark ? 'rgba(255,255,255,0.06)' : colors.bgLight),
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 3,
                                                    borderRadius: 6,
                                                    marginBottom: 8,
                                                    borderWidth: 1,
                                                    borderColor: isCurrent ? colors.warning + '40' : colors.stroke,
                                                }}>
                                                    <Text style={{
                                                        color: isCurrent ? colors.warning : colors.textGrey,
                                                        fontSize: 10.5,
                                                        fontFamily: 'Poppins-Bold',
                                                    }}>
                                                        {phase.dayRange.toUpperCase()}
                                                    </Text>
                                                </View>

                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20, marginBottom: 8 }]}>
                                                    {phase.timelineDescription || phase.cardDescription}
                                                </Text>



                                                {/* Actionable Note */}
                                                {(isCurrent || isPast) && (
                                                    <View style={{
                                                        flexDirection: 'row',
                                                        backgroundColor: isCurrent ? colors.warning + '14' : colors.surface,
                                                        padding: 12,
                                                        borderRadius: 10,
                                                        borderWidth: 1,
                                                        borderColor: isCurrent ? colors.warning + '4D' : colors.stroke,
                                                        marginTop: 4,
                                                    }}>
                                                        <MaterialIcons name="lightbulb" size={16} color={isCurrent ? colors.warning : colors.primary} style={{ marginRight: 8, marginTop: 2 }} />
                                                        <Text style={[textStyles.body, { color: isCurrent ? colors.text : colors.textGrey, fontSize: 12.5, flex: 1, lineHeight: 18, fontFamily: 'Poppins-Regular' }]}>
                                                            {phase.todayAction || phase.actionable}
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Bottom Navigation */}
            <FloatingNavBar />

            {/* Batch Selection Modal (AniGrow native SelectionModal) */}
            <SelectionModal
                visible={isBatchModalVisible}
                onClose={() => setIsBatchModalVisible(false)}
                onSelect={(val) => {
                    const idx = batchOptions.indexOf(val);
                    if (idx >= 0) {
                        setSelectedBatchId(allBatchesForType[idx].id);
                    }
                    setIsBatchModalVisible(false);
                }}
                title="Select Batch"
                description="Choose an active cohort to view its growth timeline guide."
                icon="layers"
                options={batchOptions}
                selectedValue={selectedBatchLabel}
                requireConfirm={false}
                enableSearch={false}
            />

            {/* Skip / Reject Reason Modal (Required note for AI adaptive feedback) */}
            <Modal
                visible={skipModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setSkipModalVisible(false)}
            >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <View style={{
                        flex: 1,
                        backgroundColor: 'rgba(0,0,0,0.65)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingHorizontal: 20,
                    }}>
                        <View style={{
                            width: '100%',
                            maxWidth: 460,
                            backgroundColor: colors.surface,
                            borderRadius: 20,
                            padding: 20,
                            borderWidth: 1,
                            borderColor: colors.stroke,
                            gap: 14,
                        }}>
                            {/* Modal Header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    <View style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 18,
                                        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="assignment-late" size={20} color="#EF4444" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { fontSize: 15, fontFamily: 'Poppins-Bold', color: colors.text }]}>
                                            Action Not Performed
                                        </Text>
                                        <Text style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>
                                            Required: State why this suggestion was skipped
                                        </Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setSkipModalVisible(false)}
                                    style={{ padding: 4 }}
                                >
                                    <MaterialIcons name="close" size={20} color={colors.textGrey} />
                                </TouchableOpacity>
                            </View>

                            {/* Action text preview */}
                            {selectedActionForSkip && (
                                <View style={{
                                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.bgLight,
                                    padding: 10,
                                    borderRadius: 10,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                }}>
                                    <Text style={{ fontSize: 10.5, color: colors.textGrey, fontFamily: 'Poppins-Bold', marginBottom: 2 }}>
                                        SUGGESTED TASK ({selectedActionForSkip.actionItem.dayTag})
                                    </Text>
                                    <Text style={{ fontSize: 12.5, color: colors.text, fontFamily: 'Poppins-SemiBold', lineHeight: 17 }}>
                                        {selectedActionForSkip.actionItem.action}
                                    </Text>
                                </View>
                            )}

                            {/* Quick reason pills */}
                            <View>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins-Bold', color: colors.textGrey, marginBottom: 6 }}>
                                    QUICK SELECT REASON:
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    {SKIP_REASON_OPTIONS.map((opt, oIdx) => {
                                        const isSelected = skipReason === opt;
                                        return (
                                            <TouchableOpacity
                                                key={oIdx}
                                                activeOpacity={0.7}
                                                onPress={() => setSkipReason(opt)}
                                                style={{
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 5,
                                                    borderRadius: 14,
                                                    backgroundColor: isSelected
                                                        ? colors.primary
                                                        : (isDark ? 'rgba(255,255,255,0.05)' : colors.bgLight),
                                                    borderWidth: 1,
                                                    borderColor: isSelected ? colors.primary : colors.stroke,
                                                }}
                                            >
                                                <Text style={{
                                                    fontSize: 11,
                                                    fontFamily: isSelected ? 'Poppins-Bold' : 'Poppins-Medium',
                                                    color: isSelected ? colors.onPrimary : colors.text,
                                                }}>
                                                    {opt}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Custom Reason Text Input */}
                            <View>
                                <Text style={{ fontSize: 11, fontFamily: 'Poppins-Bold', color: colors.textGrey, marginBottom: 4 }}>
                                    EXPLANATION / NOTES *
                                </Text>
                                <TextInput
                                    value={skipReason}
                                    onChangeText={setSkipReason}
                                    placeholder="Explain why this action was not done or rejected..."
                                    placeholderTextColor={colors.textGrey}
                                    multiline
                                    numberOfLines={3}
                                    style={{
                                        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.bgLight,
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: skipReason.trim() ? colors.primary : colors.stroke,
                                        padding: 10,
                                        fontSize: 12.5,
                                        color: colors.text,
                                        fontFamily: 'Poppins-Regular',
                                        minHeight: 65,
                                        textAlignVertical: 'top',
                                    }}
                                />
                            </View>

                            {/* AniBot AI Learning Note */}
                            <View style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
                                padding: 8,
                                borderRadius: 8,
                            }}>
                                <MaterialIcons name="auto-awesome" size={14} color="#10B981" />
                                <Text style={{ fontSize: 10.5, color: '#10B981', fontFamily: 'Poppins-Medium', flex: 1, lineHeight: 14 }}>
                                    AniBot will factor this reason into future batch health & growth SOP adjustments.
                                </Text>
                            </View>

                            {/* Modal Buttons */}
                            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setSkipModalVisible(false)}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 10,
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: colors.stroke,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text style={{ fontSize: 13, fontFamily: 'Poppins-SemiBold', color: colors.textGrey }}>
                                        Cancel
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={handleSubmitSkipReason}
                                    disabled={!skipReason.trim() || isSubmittingReason}
                                    style={{
                                        flex: 1.5,
                                        paddingVertical: 10,
                                        borderRadius: 10,
                                        backgroundColor: skipReason.trim() ? '#F59E0B' : (isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB'),
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexDirection: 'row',
                                        gap: 6,
                                    }}
                                >
                                    {isSubmittingReason ? (
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                    ) : (
                                        <>
                                            <MaterialIcons name="save" size={15} color={skipReason.trim() ? '#FFFFFF' : colors.textGrey} />
                                            <Text style={{
                                                fontSize: 13,
                                                fontFamily: 'Poppins-Bold',
                                                color: skipReason.trim() ? '#FFFFFF' : colors.textGrey,
                                            }}>
                                                Save Reason & Skip
                                            </Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </View>
    );
}

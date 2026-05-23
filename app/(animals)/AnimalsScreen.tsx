import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, ScrollView, TouchableOpacity, View, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTextStyles } from '@/constants/textStyles';
import { useTheme } from '@/context/ThemeContext';
import { useAnimalStyles } from '@/styles/animalStyles';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { ProfileDrawer } from '@/components/ProfileDrawer';
import { useAuth } from '@/context/AuthContext';
import { useFarmFilter } from '@/context/FarmFilterContext';
import { supabase } from '@/lib/supabase';

interface HousingSummary {
    id: string;
    name: string;
    animal_type: 'chicken' | 'pig';
    current_count: number;
    capacity: number;
    active_batch_name: string | null;
    active_batch_arrival_date: string | null;
    active_batch_age_at_arrival_days: number;
}

const ANIMAL_IMAGES: Record<string, any> = {
    pig: require('../../assets/images/animals/pigs.jpg'),
    chicken: require('../../assets/images/animals/chickens.png'),
};

export default function AnimalsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnimalStyles();
    const router = useRouter();
    const { profile, permissions, role, isLoading: authLoading } = useAuth();
    const { activeFarmIds } = useFarmFilter();

    const farmId = activeFarmIds[0] || (profile as any)?.farm_id || '';
    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? '';

    const RESTRICTED_ROLES = ['caretaker', 'veterinarian', 'flockman'];
    const canManageHousing = !!permissions['housing:manage'];

    useEffect(() => {
        if (authLoading || !role) return;
        if (RESTRICTED_ROLES.includes(role) && !permissions['animals:view']) {
            router.replace('/(dashboard)/HomeScreen' as any);
        }
    }, [authLoading, role, permissions]);

    const [housings, setHousings] = useState<HousingSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

    const calculateAge = (arrivalDateStr: string | null, ageAtArrivalDays: number, animalType: 'chicken' | 'pig') => {
        if (!arrivalDateStr) return '';
        const arrivalDate = new Date(arrivalDateStr);
        const today = new Date();
        arrivalDate.setHours(0,0,0,0);
        today.setHours(0,0,0,0);
        
        const diffTime = today.getTime() - arrivalDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const ageDays = Math.max(0, diffDays) + (ageAtArrivalDays || 0);

        if (animalType === 'chicken') {
            return `${ageDays} ${ageDays === 1 ? 'day' : 'days'}`;
        } else {
            if (ageDays < 30) {
                return `${ageDays} ${ageDays === 1 ? 'day' : 'days'}`;
            } else {
                const months = Math.floor(ageDays / 30);
                const remainingDays = ageDays % 30;
                if (remainingDays === 0) {
                    return `${months} ${months === 1 ? 'month' : 'months'} (${ageDays} days)`;
                } else {
                    return `${months} ${months === 1 ? 'month' : 'months'}, ${remainingDays} ${remainingDays === 1 ? 'day' : 'days'} (${ageDays} days)`;
                }
            }
        }
    };

    const fetchHousings = useCallback(async () => {
        if (!farmId) { setIsLoading(false); return; }
        setIsLoading(true);
        try {
            // Fetch housings + their active batch (if any) in one query
            const { data, error } = await supabase
                .from('housings')
                .select(`
                    id, name, animal_type, current_count, capacity,
                    batches(id, name, status, current_count, arrival_date, age_at_arrival_days)
                `)
                .eq('farm_id', farmId)
                .eq('status', 'Active')
                .order('name', { ascending: true });

            if (error) throw error;

            const mapped: HousingSummary[] = (data ?? []).map((h: any) => {
                const activeBatches = h.batches?.filter((b: any) => b.status === 'active') || [];
                const expectedCount = activeBatches.reduce((sum: number, b: any) => sum + (b.current_count ?? 0), 0);
                
                let currentCount = h.current_count;
                if (expectedCount !== h.current_count) {
                    console.log(`[Self-Healing] Syncing housing ${h.name} (${h.id}) count from ${h.current_count} to ${expectedCount}`);
                    supabase.from('housings')
                        .update({ current_count: expectedCount })
                        .eq('id', h.id)
                        .then(({ error: uErr }) => {
                            if (uErr) console.error(`[Self-Healing] Failed to update housing ${h.id}:`, uErr.message);
                        });
                    currentCount = expectedCount;
                }

                return {
                    id: h.id,
                    name: h.name,
                    animal_type: h.animal_type,
                    current_count: currentCount,
                    capacity: h.capacity,
                    active_batch_name: activeBatches[0]?.name ?? null,
                    active_batch_arrival_date: activeBatches[0]?.arrival_date ?? null,
                    active_batch_age_at_arrival_days: activeBatches[0]?.age_at_arrival_days ?? 0,
                };
            });
            setHousings(mapped);
        } catch (err) {
            console.error('[AnimalsScreen] fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [farmId]);

    useFocusEffect(
        useCallback(() => {
            fetchHousings();
        }, [fetchHousings])
    );

    useEffect(() => {
        if (!farmId) return;

        const channel = supabase
            .channel(`animals-live-${farmId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'housings',
                    filter: `farm_id=eq.${farmId}`
                },
                () => {
                    fetchHousings();
                }
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'batches',
                    filter: `farm_id=eq.${farmId}`
                },
                () => {
                    fetchHousings();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [farmId, fetchHousings]);

    const pigColor = (colors as any).pig ?? '#E67E22';
    const chickenColor = (colors as any).chicken ?? '#F1C40F';

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTitleRow}>
                        <TouchableOpacity
                            style={{ marginRight: 8, padding: 4 }}
                            onPress={() => setProfileDrawerOpen(true)}
                            activeOpacity={0.8}
                        >
                            <MaterialIcons name="menu" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Image
                            source={require('../../assets/branding/anigrow_logo.svg')}
                            style={{ width: 36, height: 36, marginRight: 10 }}
                            contentFit="contain"
                        />
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 24 }]}>
                            Ani-Grow
                        </Text>
                    </View>
                    <View style={{ width: 40, height: 40 }} />
                </View>

                <View style={styles.headerContainer}>
                    <View style={styles.headerTextContainer}>
                        <Text style={[textStyles.h1, { color: colors.text, fontSize: 32 }]}>Animals</Text>
                        <Text style={[textStyles.body, styles.headerSubtitle, { color: colors.textGrey, fontSize: 16 }]}>
                            Track livestock head counts by housing
                        </Text>
                    </View>
                </View>

                <ScrollView
                    style={styles.container}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={isLoading}
                            onRefresh={fetchHousings}
                            colors={[colors.primary]}
                            tintColor={colors.primary}
                        />
                    }
                >
                    <View style={[styles.sectionTitleRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                        <View>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>Housings</Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                {housings.length} registered
                            </Text>
                        </View>
                        {housings.length > 0 && (
                            <TouchableOpacity
                                style={{
                                    height: 38,
                                    paddingHorizontal: 16,
                                    borderRadius: 19,
                                    backgroundColor: canManageHousing ? colors.surface : colors.cardFill,
                                    borderWidth: 1,
                                    borderColor: colors.stroke,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'row',
                                    gap: 6,
                                }}
                                onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                activeOpacity={canManageHousing ? 0.8 : 1}
                                disabled={!canManageHousing}
                            >
                                <MaterialIcons name="edit" size={14} color={canManageHousing ? colors.text : colors.textGrey} />
                                <Text style={[textStyles.btnLabel, { color: canManageHousing ? colors.text : colors.textGrey, fontSize: 12 }]}>Manage Housings</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.gridContainer}>
                        {isLoading ? (
                            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32, width: '100%' }} />
                        ) : housings.length === 0 ? (
                            <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24, marginTop: 24 }}>
                                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.primary}15`, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                                    <MaterialIcons name="home" size={36} color={colors.primary} />
                                </View>
                                <Text style={[textStyles.h2, { color: colors.text, fontSize: 18, textAlign: 'center' }]}>
                                    No housings yet
                                </Text>
                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 20 }]}>
                                    Add a housing first, then register batches to track your livestock.
                                </Text>
                                <TouchableOpacity
                                    activeOpacity={canManageHousing ? 0.8 : 1}
                                    style={{
                                        marginTop: 20,
                                        backgroundColor: canManageHousing ? colors.primary : colors.cardFill,
                                        paddingHorizontal: 24,
                                        paddingVertical: 12,
                                        borderRadius: 20,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 8
                                    }}
                                    onPress={() => router.push('/(devices)/ManageHousingsScreen' as any)}
                                    disabled={!canManageHousing}
                                >
                                    <MaterialIcons name="add" size={18} color={canManageHousing ? colors.onPrimary : colors.textGrey} />
                                    <Text style={[textStyles.label, { color: canManageHousing ? colors.onPrimary : colors.textGrey }]}>Add Housing</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            housings.map(housing => {
                                const isPig = housing.animal_type === 'pig';
                                const accent = isPig ? pigColor : chickenColor;
                                const bgColor = accent + '1A';
                                const imgSrc = ANIMAL_IMAGES[housing.animal_type];

                                return (
                                    <TouchableOpacity
                                        key={housing.id}
                                        activeOpacity={0.7}
                                        style={[
                                            styles.deviceCard,
                                            { backgroundColor: colors.surface, borderColor: colors.stroke, padding: 0, overflow: 'hidden', width: '100%', marginBottom: 12, flexDirection: 'row', alignItems: 'stretch' }
                                        ]}
                                        onPress={() => router.push({
                                            pathname: '/(animals)/AnimalDetails',
                                            params: { housingId: housing.id },
                                        })}
                                    >
                                        <Image
                                            source={imgSrc}
                                            style={{ width: 110, height: 'auto', minHeight: 110, backgroundColor: bgColor }}
                                            contentFit="cover"
                                        />
                                        <View style={{ flex: 1, padding: 14, justifyContent: 'center' }}>
                                            <Text style={[textStyles.h3, { color: colors.text, fontSize: 17, marginBottom: 6 }]}>
                                                {housing.name}
                                            </Text>
                                            <View style={{ gap: 4 }}>
                                                <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13 }]}>
                                                    Live heads:{' '}
                                                    <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>
                                                        {housing.current_count}
                                                        {housing.capacity > 0 ? ` / ${housing.capacity}` : ''}
                                                    </Text>
                                                </Text>

                                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                    <View style={{ backgroundColor: accent + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                                                        <Text style={{ color: accent, fontSize: 11, fontFamily: 'Poppins-SemiBold', textTransform: 'capitalize' }}>
                                                            {isPig ? 'Pigs' : 'Chickens'}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                        <View style={{ justifyContent: 'center', paddingRight: 12 }}>
                                            <MaterialIcons name="chevron-right" size={24} color={colors.textGrey} />
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        )}
                    </View>


                </ScrollView>
            </View>

            <FloatingNavBar />
            <ProfileDrawer
                visible={profileDrawerOpen}
                onClose={() => setProfileDrawerOpen(false)}
                activeFarmName={farmName}
            />
        </SafeAreaView>
    );
}


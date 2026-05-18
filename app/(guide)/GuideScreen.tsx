import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { AIInsightCard } from '@/components/AIInsightCard';
import { useTextStyles } from '@/constants/textStyles';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useGuideStyles } from '@/styles/guideStyles';

export default function GuideScreen() {
    const { profile } = useAuth();
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const farmName = (profile as any)?.farm_name ?? (profile as any)?.farmName ?? '';
    const styles = useGuideStyles();
    const { width } = useWindowDimensions();
    const hPad = width >= 900 ? Math.round(width * 0.12) : width >= 600 ? Math.round(width * 0.07) : 20;

    const [animalFilter, setAnimalFilter] = useState<'Pigs' | 'Chickens'>('Pigs');
    
    // Simulate current day across app logic (assume Day 22 for display)
    const currentDay = 22;

    const getPhases = () => {
        if (animalFilter === 'Chickens') {
            return [
                {
                    name: 'Arrival Phase',
                    dayRange: 'Day 1-7',
                    start: 1, end: 7,
                    description: 'Newly arrived chicks. Ensure brooding temp is ~32-35°C. Provide clean water with electrolytes immediately upon arrival.',
                    actionable: 'Action: Inspect for weak chicks and isolate. Keep feed easily accessible on flat trays.'
                },
                {
                    name: 'Starter Phase',
                    dayRange: 'Day 8-14',
                    start: 8, end: 14,
                    description: 'Crucial for early organ and bone development. Focus on high-protein (min 21%) Starter Mash.',
                    actionable: 'Action: Gradually increase ventilation. Expand feeding space to prevent overcrowding at feeders.'
                },
                {
                    name: 'Booster Phase',
                    dayRange: 'Day 15-25',
                    start: 15, end: 25,
                    description: 'Feed upgraded to Grower pellets as rapid muscle development accelerates. Monitor weight gains strictly.',
                    actionable: 'Action: Lower temperatures to ambient levels. Shift to hanging feeders to prevent feed waste.'
                },
                {
                    name: 'Finisher Phase',
                    dayRange: 'Day 26-42',
                    start: 26, end: 42,
                    description: 'Approaching target harvest weight. Feed energy density is prioritized over protein for fat marbling.',
                    actionable: 'Action: Ensure maximum water flow rate. Minimize flock disturbances to reduce stress metabolism.'
                },
                {
                    name: 'Mature Phase',
                    dayRange: 'Day 43+',
                    start: 43, end: 999,
                    description: 'Target weight reached; birds are finalized for sale or processing.',
                    actionable: 'Action: Prepare harvest schedule and sanitize bio-secure transfer crates.'
                },
            ];
        } else {
            return [
                {
                    name: 'Arrival Phase',
                    dayRange: 'Day 1-5',
                    start: 1, end: 5,
                    description: 'Piglets received. Housing must be disinfected and pre-warmed. Provide highly digestible starter feed.',
                    actionable: 'Action: Monitor carefully for signs of scouring (diarrhea). Provide constant access to fresh water.'
                },
                {
                    name: 'Starter Phase',
                    dayRange: 'Day 6-30',
                    start: 6, end: 30,
                    description: 'First month transition. Gut biome is adapting. High protein required for skeletal frame growth.',
                    actionable: 'Action: Maintain strict pen hygiene. Introduce creeping feeder pellets gradually to avoid digestive shock.'
                },
                {
                    name: 'Grower Phase',
                    dayRange: 'Day 31-90',
                    start: 31, end: 90,
                    description: 'Intense lean muscle growth period. Feed converted efficiently to muscle mass. Weekly weighing is ideal.',
                    actionable: 'Action: Scale up feed volume significantly. Ensure cooling misting systems are operational during hot days.'
                },
                {
                    name: 'Finisher Phase',
                    dayRange: 'Day 91-120',
                    start: 91, end: 120,
                    description: 'Approaching final target market weight. Diet shifted towards higher energy to build fat reserves.',
                    actionable: 'Action: Monitor pen density as pigs grow rapidly. Sort and segregate by size if necessary to prevent bullying.'
                },
                {
                    name: 'Mature Phase',
                    dayRange: 'Day 121+',
                    start: 121, end: 999,
                    description: 'Target weight reached (approx 90-100kg); ready for sale or slaughter.',
                    actionable: 'Action: Restrict feed 12-18 hours prior to transport. Organize quiet and low-stress loading.'
                },
            ];
        }
    };

    const phases = getPhases();
    
    const getCurrentPhaseIndex = () => {
        const index = phases.findIndex(p => currentDay >= p.start && currentDay <= p.end);
        return index !== -1 ? index : phases.length - 1;
    };
    
    const currentPhaseIndex = getCurrentPhaseIndex();

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Fixed App Header */}
            <View style={styles.headerTopRow}>
                <View style={styles.headerTitleRow}>
                    <Image
                        source={require('../../assets/branding/anigrow_logo.svg')}
                        style={{ width: 36, height: 36, marginRight: 10 }}
                        contentFit="contain"
                    />
                    <View>
                        <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 24 }]}>
                            Ani-Grow
                        </Text>
                        <Text translate={false} style={{ fontSize: 11, color: colors.textGrey, fontFamily: 'Poppins-Regular' }}>
                            {farmName}
                        </Text>
                    </View>
                </View>
                <View style={{ width: 40, height: 40 }} />
            </View>

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

            {/* Animal Tab Filter */}
            <View style={styles.filterContainer}>
                {['Pigs', 'Chickens'].map((filter) => (
                    <TouchableOpacity
                        key={filter}
                        activeOpacity={0.7}
                        onPress={() => setAnimalFilter(filter as 'Pigs' | 'Chickens')}
                        style={[
                            styles.filterChip,
                            animalFilter === filter && styles.filterChipActive
                        ]}
                    >
                        <Text style={[
                            styles.filterChipText,
                            animalFilter === filter && styles.filterChipTextActive
                        ]}>
                            {filter}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView 
                showsVerticalScrollIndicator={false}
                style={styles.container}
                contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: hPad }}
            >
                    {/* Simulated "Day 22" Header Card */}
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
                        marginTop: 8
                    }}>
                        <View style={{ flex: 1, marginRight: 16 }}>
                            <Text style={[textStyles.h2, { color: colors.text, fontSize: 20, marginBottom: 4 }]}>
                                {animalFilter} Timeline
                            </Text>
                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 13, lineHeight: 20 }]}>
                                Currently in <Text style={{fontWeight: 'bold', color: colors.primary}}>{phases[currentPhaseIndex].name}</Text>. Actionable steps below are tailored for today.
                            </Text>
                        </View>
                        <View style={[styles.dayBadge, { 
                            marginBottom: 0, 
                            backgroundColor: colors.primary + '1A', 
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderRadius: 12,
                            alignItems: 'center',
                            shadowOpacity: 0,
                            elevation: 0
                        }]}>
                            <Text style={[textStyles.label, { color: colors.primary, fontSize: 10, letterSpacing: 1.2, fontWeight: '700' }]}>
                                DAY
                            </Text>
                            <Text style={[textStyles.h1, { color: colors.primary, fontSize: 28, lineHeight: 28 }]}>
                                {currentDay}
                            </Text>
                        </View>
                    </View>

                    <AIInsightCard 
                        title="AniBot Insight"
                        staticContent={animalFilter === 'Pigs' 
                            ? "For Day 22, piglets are rapidly gaining weight. Ensure the creeping feeder is well-stocked and water flow rate is optimal to support their growing digestion."
                            : "At Day 22, your flock is transitioning well into the Booster Phase. Start gradually dropping the ambient temperature and double check the hanging feeders for any blockages."}
                        variant="green"
                    />

                    {/* Timeline List View */}
                    <Text style={[textStyles.h3, { color: colors.text, fontSize: 18, marginBottom: 16 }]}>Growth Phases</Text>

                    <View style={{ marginBottom: 20 }}>
                        {phases.map((phase, index) => {
                            const isPast = index < currentPhaseIndex;
                            const isCurrent = index === currentPhaseIndex;
                            const isFuture = index > currentPhaseIndex;

                            const circleColor = isPast ? colors.primary : isCurrent ? colors.warning : colors.surface;
                            const borderColor = isPast ? colors.primary : isCurrent ? colors.warning : colors.stroke;
                            const titleColor = isCurrent ? colors.warning : colors.text;

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
                                            shadowOffset: { width: 0, height: 0 }
                                        }}>
                                            {isPast && <MaterialIcons name="check" size={14} color="#FFF" />}
                                            {isCurrent && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} />}
                                        </View>
                                        
                                        {index < phases.length - 1 && (
                                            <View style={{ 
                                                width: 2, 
                                                flex: 1, 
                                                backgroundColor: isPast ? colors.primary : colors.stroke,
                                                marginBottom: -20, // stretch to next item
                                                marginTop: 4
                                            }} />
                                        )}
                                    </View>

                                    {/* Content Card */}
                                    <View style={{ 
                                        flex: 1, 
                                        opacity: isFuture ? 0.6 : 1, // dim future phases
                                        paddingBottom: 8 
                                    }}>
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
                                            marginBottom: 10
                                        }}>
                                            <Text style={[textStyles.label, { 
                                                color: isCurrent ? colors.warning : colors.textGrey, 
                                                fontSize: 11 
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
                                                marginTop: 4
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
        </SafeAreaView>
    );
}

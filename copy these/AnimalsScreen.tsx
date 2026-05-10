import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTextStyles } from '../../src/constants/textStyles';
import { useTheme } from '../../src/context/ThemeContext';
import { useAnimalStyles } from '../../src/styles/animalStyles';

// Mock Animal Data
const MOCK_ANIMALS = [
    { id: '1', type: 'Pigs', headCount: 150, batchNumber: 'P-042', imageSrc: require('../../assets/images/animals/pigs.jpg') },
    { id: '2', type: 'Chickens', headCount: 320, batchNumber: 'C-108', imageSrc: require('../../assets/images/animals/chickens.png') },
];

export default function AnimalsScreen() {
    const { colors } = useTheme();
    const textStyles = useTextStyles();
    const styles = useAnimalStyles(); // Using our specific Animal styles
    const router = useRouter();

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Top Nav / Logo Row, aligned exactly like HomeScreen.tsx */}
            <View style={styles.headerTopRow}>
                <View style={styles.headerTitleRow}>
                    <Image
                        source={require('../../assets/branding/anigrow_logo.svg')}
                        style={{ width: 36, height: 36, marginRight: 10 }}
                        contentFit="contain"
                    />
                    <Text style={[textStyles.h1, { fontSize: 20, color: colors.primary, lineHeight: 28 }]}>
                        Ani-Grow
                    </Text>
                </View>
                <View style={{ width: 40, height: 40 }} />
            </View>

            <View style={styles.headerContainer}>
                {/* Header Text */}
                <View style={styles.headerTextContainer}>
                    <Text style={[textStyles.h1, { color: colors.text, fontSize: 32 }]}>
                        Animals
                    </Text>
                    <Text style={[textStyles.body, styles.headerSubtitle, { color: colors.textGrey, fontSize: 16 }]}>
                        Track livestock head counts and batches
                    </Text>
                </View>
            </View>

            <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

                {/* Section Title */}
                <View style={styles.sectionTitleRow}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                        Current Livestock
                    </Text>
                </View>

                {/* Grid Section */}
                <View style={styles.gridContainer}>
                    {MOCK_ANIMALS.map(animal => {
                        const isPig = animal.type === 'Pigs';

                        // Theme Colors (using user's pig and chicken colors added earlier)
                        const iconColor = isPig ? colors.pig : colors.chicken;
                        const bgColor = isPig ? colors.pig + '1A' : colors.chicken + '1A';

                        return (
                            <TouchableOpacity
                                key={animal.id}
                                activeOpacity={0.7}
                                style={[
                                    styles.deviceCard,
                                    { backgroundColor: colors.surface, borderColor: colors.stroke, padding: 0, overflow: 'hidden', width: '100%', marginBottom: 12, flexDirection: 'row', alignItems: 'stretch' }
                                ]}
                                onPress={() => {
                                    router.push({ pathname: '/(animals)/AnimalDetails', params: { type: animal.type } });
                                }}
                            >
                                <Image
                                    source={animal.imageSrc}
                                    style={{ width: 120, height: 'auto', minHeight: 120, backgroundColor: bgColor }}
                                    contentFit="cover"
                                />
                                <View style={{ flex: 1, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[textStyles.h3, { color: colors.text, fontSize: 20, marginBottom: 8 }]}>
                                            {animal.type}
                                        </Text>

                                        <View style={{ gap: 6 }}>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14 }]}>
                                                Head Count:  <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{animal.headCount}</Text>
                                            </Text>
                                            <Text style={[textStyles.body, { color: colors.textGrey, fontSize: 14 }]}>
                                                Current Batch:  <Text style={{ color: colors.text, fontFamily: 'Poppins-SemiBold' }}>{animal.batchNumber}</Text>
                                            </Text>
                                        </View>
                                    </View>
                                    <MaterialIcons name="chevron-right" size={24} color={colors.textGrey} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Management Actions */}
                <View style={[styles.sectionTitleRow, { marginTop: 12 }]}>
                    <Text style={[textStyles.h2, { color: colors.text, fontSize: 20 }]}>
                        Management
                    </Text>
                </View>
                <View style={[styles.bottomBar, { gap: 12, paddingTop: 0 }]}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                        onPress={() => {
                            router.push('/(devices)/ManageHousingsScreen');
                        }}
                    >
                        <Text style={[textStyles.btnLabel, { color: colors.onPrimary }]}>Manage Housings</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={[styles.primaryButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.stroke }]}
                        onPress={() => {
                            router.push('/(devices)/ManageFeedsScreen');
                        }}
                    >
                        <Text style={[textStyles.btnLabel, { color: colors.text }]}>Manage Feeds</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

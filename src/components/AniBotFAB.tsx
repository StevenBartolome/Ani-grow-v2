import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, TouchableOpacity, View } from 'react-native';

const BOT_COLOR = '#8B5CF6';

// Screens where the FAB should NOT appear
const HIDDEN_ON = [
    'aiassistantscreen',
    'loginscreen',
    'registerscreen',
    'forgotpasswordscreen',
    'resetpasswordscreen',
    'privacypolicyscreen',
    'termsofservicescreen',
    'mfachallengescreen',
];

export function AniBotFAB() {
    const router   = useRouter();
    const pathname = usePathname();

    const isHidden = HIDDEN_ON.some(p => pathname.toLowerCase().includes(p));

    // Pulse animation
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isHidden) return;
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [isHidden, pulseAnim]);

    if (isHidden) return null;

    return (
        <View
            pointerEvents="box-none"
            style={{
                position: 'absolute',
                bottom: 100,   // sits above the floating nav bar
                right: 20,
                zIndex: 999,
            }}
        >
            {/* Glow ring */}
            <Animated.View
                style={{
                    position: 'absolute',
                    width: 58, height: 58,
                    borderRadius: 29,
                    backgroundColor: BOT_COLOR + '30',
                    top: -4, left: -4,
                    transform: [{ scale: pulseAnim }],
                }}
            />

            <TouchableOpacity
                onPress={() => router.push('/(ai)/AIAssistantScreen' as any)}
                activeOpacity={0.85}
                style={{
                    width: 50, height: 50, borderRadius: 25,
                    backgroundColor: BOT_COLOR,
                    alignItems: 'center', justifyContent: 'center',
                    shadowColor: BOT_COLOR,
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.45,
                    shadowRadius: 10,
                    elevation: 10,
                }}
            >
                <MaterialIcons name="smart-toy" size={26} color="#fff" />
            </TouchableOpacity>
        </View>
    );
}

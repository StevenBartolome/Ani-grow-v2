import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Text';
import { useTheme } from '@/context/ThemeContext';

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
    const router = useRouter();
    const pathname = usePathname();
    const { colors } = useTheme();

    const isHidden = HIDDEN_ON.some(p => pathname.toLowerCase().includes(p));
    if (isHidden) return null;

    // The route name must match the Stack.Screen name (no group prefix — groups are transparent)
    const handlePress = () => router.push('/(ai)/AIAssistantScreen' as any);

    return (
        <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.82}
            style={{
                position: 'absolute',
                right: 0,
                bottom: 210,
                zIndex: 999,
                backgroundColor: colors.primary,
                borderTopLeftRadius: 14,
                borderBottomLeftRadius: 14,
                paddingVertical: 14,
                paddingLeft: 12,
                paddingRight: 10,
                alignItems: 'center',
                gap: 10,
                overflow: 'visible',
                ...Platform.select({
                    web: { boxShadow: `-3px 3px 14px rgba(0,0,0,0.25)` } as any,
                    default: {
                        shadowColor: '#000',
                        shadowOffset: { width: -2, height: 3 },
                        shadowOpacity: 0.22,
                        shadowRadius: 8,
                        elevation: 10,
                    },
                }),
            }}
        >
            {/* Robot icon */}
            <MaterialIcons name="smart-toy" size={20} color="#fff" />

            {/* "AniBot" rotated 90° so it reads bottom-to-top */}
            <View style={{ width: 20, height: 56, overflow: 'visible' }}>
                <Text
                    style={{
                        color: '#fff',
                        fontSize: 12,
                        fontFamily: 'Poppins-SemiBold',
                        letterSpacing: 0.5,
                        position: 'absolute',
                        width: 56,
                        height: 16,
                        left: -18,
                        top: 20,
                        textAlign: 'center',
                        transform: [{ rotate: '-90deg' }],
                    }}
                >
                    AniBot
                </Text>
            </View>
        </TouchableOpacity>
    );
}

import { MaterialIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React, { useRef, useState, useEffect } from 'react';
import { Platform, View, Animated, PanResponder, Dimensions } from 'react-native';
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

const BUTTON_WIDTH = 54;
const BUTTON_HEIGHT = 54;

// Persist position across component unmounts (e.g. when navigating to screens where the FAB is hidden)
let savedPosition: { x: number; y: number } | null = null;

export function AniBotFAB() {
    const router = useRouter();
    const pathname = usePathname();
    const { colors } = useTheme();

    const isHidden = HIDDEN_ON.some(p => pathname.toLowerCase().includes(p));

    const handlePress = () => router.push('/AIAssistantScreen' as any);

    // Get screen dimensions
    const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

    // Initial position: right side, aligned vertically
    const initialX = screenWidth - BUTTON_WIDTH - 12;
    const initialY = screenHeight - 210 - BUTTON_HEIGHT;

    const position = useRef(savedPosition || { x: initialX, y: initialY });
    const pan = useRef(new Animated.ValueXY(position.current)).current;

    // Active animation value to control scale, opacity, and shadow transitions smoothly
    const activeAnim = useRef(new Animated.Value(0)).current;

    // Sync position ref with animation updates and save globally
    useEffect(() => {
        const listenerId = pan.addListener((value) => {
            position.current = value;
            savedPosition = value;
        });
        return () => {
            pan.removeListener(listenerId);
        };
    }, [pan]);

    // Handle screen dimension changes (especially for web or rotation)
    useEffect(() => {
        const onChange = () => {
            const { width: newWidth, height: newHeight } = Dimensions.get('window');
            
            // Re-snap to nearest edge
            const finalX = position.current.x;
            const snapToLeft = finalX < newWidth / 2;
            const targetX = snapToLeft ? 8 : newWidth - BUTTON_WIDTH - 8;
            const targetY = Math.min(Math.max(position.current.y, 60), newHeight - BUTTON_HEIGHT - 100);
            
            Animated.spring(pan, {
                toValue: { x: targetX, y: targetY },
                useNativeDriver: false,
            }).start();
        };

        const subscription = Dimensions.addEventListener('change', onChange);
        return () => subscription.remove();
    }, []);

    // PanResponder to handle dragging and snapping
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                // Ignore small movements to allow taps to register
                return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
            },
            onPanResponderGrant: () => {
                // Animate to active (dragging) state
                Animated.spring(activeAnim, {
                    toValue: 1,
                    useNativeDriver: false,
                    tension: 60,
                    friction: 7,
                }).start();

                pan.setOffset({
                    x: position.current.x,
                    y: position.current.y,
                });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event(
                [null, { dx: pan.x, dy: pan.y }],
                { useNativeDriver: false }
            ),
            onPanResponderRelease: (_, gestureState) => {
                // Animate back to resting state
                Animated.spring(activeAnim, {
                    toValue: 0,
                    useNativeDriver: false,
                    tension: 60,
                    friction: 7,
                }).start();

                pan.flattenOffset();

                const wasTap = Math.abs(gestureState.dx) < 5 && Math.abs(gestureState.dy) < 5;
                if (wasTap) {
                    handlePress();
                    return;
                }

                const { width: winWidth, height: winHeight } = Dimensions.get('window');
                const finalX = position.current.x;
                const finalY = position.current.y;

                const snapToLeft = finalX < winWidth / 2;
                // Snap with a small 8px margin from the screen edge for a cleaner circular AssistiveTouch look
                const targetX = snapToLeft ? 8 : winWidth - BUTTON_WIDTH - 8;

                // Keep vertically within bounds (avoiding headers and tab bars)
                const minY = 60;
                const maxY = winHeight - BUTTON_HEIGHT - 100;
                const targetY = Math.min(Math.max(finalY, minY), maxY);

                Animated.spring(pan, {
                    toValue: { x: targetX, y: targetY },
                    useNativeDriver: false,
                    tension: 40,
                    friction: 8,
                }).start();
            },
            onPanResponderTerminate: () => {
                Animated.spring(activeAnim, {
                    toValue: 0,
                    useNativeDriver: false,
                }).start();

                pan.flattenOffset();
                
                const { width: winWidth, height: winHeight } = Dimensions.get('window');
                const finalX = position.current.x;
                const finalY = position.current.y;

                const snapToLeft = finalX < winWidth / 2;
                const targetX = snapToLeft ? 8 : winWidth - BUTTON_WIDTH - 8;

                const minY = 60;
                const maxY = winHeight - BUTTON_HEIGHT - 100;
                const targetY = Math.min(Math.max(finalY, minY), maxY);

                Animated.spring(pan, {
                    toValue: { x: targetX, y: targetY },
                    useNativeDriver: false,
                    tension: 40,
                    friction: 8,
                }).start();
            },
        })
    ).current;

    if (isHidden) return null;

    // Define style interpolations based on activeAnim
    const scale = activeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.12],
    });

    const opacity = activeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.75, 0.95], // Translucent resting, solid-like when dragging
    });

    const shadowOpacity = activeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.2, 0.35],
    });

    const shadowRadius = activeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [6, 12],
    });

    const elevation = activeAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [6, 12],
    });

    return (
        <Animated.View
            {...panResponder.panHandlers}
            style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: [
                    { translateX: pan.x },
                    { translateY: pan.y },
                    { scale }
                ],
                width: BUTTON_WIDTH,
                height: BUTTON_HEIGHT,
                borderRadius: BUTTON_WIDTH / 2,
                zIndex: 999,
                backgroundColor: colors.primary + 'C0', // Approx 75% base color opacity for glass style
                borderWidth: 2,
                borderColor: 'rgba(255, 255, 255, 0.35)', // Subtle white borders highlight
                alignItems: 'center',
                justifyContent: 'center',
                opacity,
                ...Platform.select({
                    web: { boxShadow: `0px 4px 16px rgba(0,0,0,0.2)` } as any,
                    default: {
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity,
                        shadowRadius,
                        elevation,
                    },
                }),
            }}
        >
            {/* Concentric inner circle for premium AssistiveTouch detail */}
            <View style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.25)',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {/* Chat icon */}
                <MaterialIcons name="chat" size={22} color="#fff" />
            </View>
        </Animated.View>
    );
}

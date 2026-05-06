import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { useFloatingNavBarStyles } from '@/styles/floatingNavBarStyles';

type NavItemDef = {
    name: string;
    iconFilled: any;
    iconStroke: any;
    route: string;
    size: number;
};

const DEFAULT_SIZE = 26;
const ANIMALS_SIZE = 38;

const navItems: NavItemDef[] = [
    { name: 'Home', iconFilled: require('../../assets/icons/home-filled.svg'), iconStroke: require('../../assets/icons/home-stroke.svg'), route: '/(dashboard)/HomeScreen', size: DEFAULT_SIZE },
    { name: 'Devices', iconFilled: require('../../assets/icons/devices-filled.svg'), iconStroke: require('../../assets/icons/devices-stroke.svg'), route: '/(devices)/DevicesScreen', size: DEFAULT_SIZE },
    { name: 'Animals', iconFilled: require('../../assets/icons/animals-filled.svg'), iconStroke: require('../../assets/icons/animals-stroke.svg'), route: '/(animals)/AnimalsScreen', size: ANIMALS_SIZE },
    { name: 'Analytics', iconFilled: require('../../assets/icons/analytics-filled.svg'), iconStroke: require('../../assets/icons/analytics-stroke.svg'), route: '/(analytics)/AnalyticsScreen', size: DEFAULT_SIZE },
    { name: 'Guide', iconFilled: require('../../assets/icons/guide-filled.svg'), iconStroke: require('../../assets/icons/guide-stroke.svg'), route: '/(guide)/GuideScreen', size: DEFAULT_SIZE },
];

export const FloatingNavBar = () => {
    const router = useRouter();
    const pathname = usePathname();
    const { colors, isDark } = useTheme();
    const styles = useFloatingNavBarStyles();

    const handleNavigation = (route: string) => {
        if (route !== pathname) {
            router.push(route as any);
        }
    };

    const gradientStart = isDark ? 'rgba(18, 18, 18, 0)' : 'rgba(249, 249, 249, 0)';
    const gradientEnd = colors.bgLight;

    return (
        <View style={styles.wrapper} pointerEvents="box-none">
            <LinearGradient
                colors={[gradientStart, gradientEnd]}
                style={styles.gradient}
                pointerEvents="none"
            />

            <View style={styles.container}>
                {navItems.map((item, index) => {
                    const isActive = pathname.toLowerCase().includes(item.name.toLowerCase()) ||
                        (item.name === 'Home' && pathname.includes('HomeScreen'));

                    return (
                        <TouchableOpacity
                            key={index}
                            style={styles.navItem}
                            onPress={() => handleNavigation(item.route)}
                            activeOpacity={0.7}
                        >
                            <Image
                                source={isActive ? item.iconFilled : item.iconStroke}
                                style={{ width: item.size, height: item.size }}
                                contentFit="contain"
                                transition={200}
                            />
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};
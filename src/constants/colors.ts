const palette = {
    green900: '#006400',
    greenDark: '#43A047', // A softer, dark-mode compatible classic green
    greenLime: '#B7E43A',
    greenLight: '#E8F5E9',
    gold: '#D8B800',
    red: '#AA0303',
    orange: '#CC6013',
    purple: '#8E24AA',
    grey300: '#E0E0E0',
    grey400: '#BEBEBE',
    grey600: '#757575',
    grey100: '#F0F0F0',
    white: '#FFFFFF',
    black: '#000000',
    pink: '#EC4899', // pig
    orangeBright: '#F97316', // chicken
} as const;

export const lightColors = {
    // Brand
    primary: palette.green900,
    secondary: palette.gold,

    // Backgrounds & Surfaces
    bg: palette.white,
    bgLight: '#F9F9F9',
    surface: palette.white,
    card: '#F1F1F1',
    cardFill: '#F7F7F8',
    inputFill: '#F7F8FA',
    divider: palette.grey100,

    // Text
    text: palette.black,
    textSecondary: palette.gold,
    textGrey: palette.grey600,
    textLight: palette.grey300,

    // Icons & Nav
    icon: palette.grey600,
    navActive: palette.green900,
    navInactive: palette.grey400,

    // Semantic
    error: palette.red,
    negative: palette.red,
    warning: '#F59E0B',
    info: '#3B82F6',
    success: '#10B981',
    smartScale: '#6C63FF',
    livestock: palette.orange,
    poultry: palette.green900,
    prediction: palette.purple,
    pig: palette.pink,
    chicken: palette.orangeBright,

    // On-colors
    onPrimary: palette.white,
    onSecondary: palette.black,

    // Stroke
    stroke: '#D8D8D8',
    shadow: 'rgba(0,0,0,0.03)',
};

export const darkColors = {
    // Brand
    primary: palette.greenDark,
    secondary: palette.gold,

    // Backgrounds & Surfaces
    bg: '#121212',
    bgLight: '#18181A',
    surface: '#242424',
    card: '#1E1E1E',
    cardFill: '#2A2A2A',
    inputFill: '#2C2C2C',
    divider: '#333333',

    // Text
    text: palette.white,
    textSecondary: palette.gold,
    textGrey: palette.grey400,
    textLight: palette.grey600,

    // Icons & Nav
    icon: palette.grey400,
    navActive: palette.greenDark,
    navInactive: palette.grey600,

    // Semantic
    error: '#FF4C4C',
    negative: '#FF4C4C',
    warning: '#FBBF24',
    info: '#60A5FA',
    success: '#34D399',
    smartScale: '#827BFF',
    livestock: '#FFA726',
    poultry: palette.greenDark,
    prediction: '#AB47BC',
    pig: '#F472B6',
    chicken: '#FB923C',

    // On-colors
    onPrimary: palette.black,
    onSecondary: palette.white,

    // Stroke
    stroke: '#3A3A3C',
    shadow: 'rgba(0,0,0,0.3)',
};

export type ColorsType = {
    [K in keyof typeof lightColors]: string;
};

// Gradients (use with expo-linear-gradient or react-native-linear-gradient)
export const gradients = {
    primary: {
        colors: [palette.greenLight, palette.white] as const,
        start: { x: 0.5, y: 0 },
        end: { x: 0.5, y: 1 },
    },
    text: {
        colors: [palette.green900, palette.greenLime] as const,
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
    },
};

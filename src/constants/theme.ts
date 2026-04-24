import { ColorsType } from './colors';

export const createTheme = (colors: ColorsType) => ({
    // Spacing scale (use multiples of 4)
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },

    // Border radius
    radius: { sm: 4, md: 8, lg: 16, full: 9999 },

    // Shadows
    shadow: {
        card: {
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 1,
            shadowRadius: 4,
            elevation: 2,
        },
    },

    // Component tokens
    components: {
        button: {
            bg: colors.primary,
            text: colors.onPrimary,
            radius: 9999,
            paddingV: 16,
            paddingH: 24,
        },
        appBar: {
            bg: colors.bg,
            tint: colors.primary,
            elevation: 0,
        },
        navBar: {
            bg: colors.bg,
            active: colors.navActive,
            inactive: colors.navInactive,
        },
        input: {
            fill: 'transparent',
            stroke: colors.stroke,
            radius: 9999,
        },
        card: {
            bg: colors.card,
            stroke: colors.stroke,
            radius: 12,
        },
    },
});

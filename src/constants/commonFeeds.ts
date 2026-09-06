export interface FeedOption {
    name: string;
    animalType: 'chicken' | 'pig';
}

export interface CategoryOption {
    name: string;
    animalType: 'chicken' | 'pig';
}

export const COMMON_FEEDS: FeedOption[] = [
    // ── Pigs (Baboy) ────────────────────────────────────────────────
    // B-Meg
    { name: 'B-Meg Hog Pre-Starter', animalType: 'pig' },
    { name: 'B-Meg Hog Booster', animalType: 'pig' },
    { name: 'B-Meg Hog Starter', animalType: 'pig' },
    { name: 'B-Meg Hog Grower', animalType: 'pig' },
    { name: 'B-Meg Hog Finisher', animalType: 'pig' },
    { name: 'B-Meg Premium Gestating Sow', animalType: 'pig' },
    { name: 'B-Meg Premium Lactating Sow', animalType: 'pig' },
    { name: 'B-Meg Piglet Milk Replacer', animalType: 'pig' },

    // Purina
    { name: 'Purina Hog Chow Pre-Starter', animalType: 'pig' },
    { name: 'Purina Hog Chow Booster', animalType: 'pig' },
    { name: 'Purina Hog Chow Starter', animalType: 'pig' },
    { name: 'Purina Hog Chow Grower', animalType: 'pig' },
    { name: 'Purina Hog Chow Finisher', animalType: 'pig' },
    { name: 'Purina Hog Chow Gestating', animalType: 'pig' },
    { name: 'Purina Hog Chow Lactating', animalType: 'pig' },

    // Pilmico
    { name: 'Pilmico Hog Pre-Starter', animalType: 'pig' },
    { name: 'Pilmico Hog Booster', animalType: 'pig' },
    { name: 'Pilmico Hog Starter', animalType: 'pig' },
    { name: 'Pilmico Hog Grower', animalType: 'pig' },
    { name: 'Pilmico Hog Finisher', animalType: 'pig' },
    { name: 'Pilmico Gestating Sow Pellet', animalType: 'pig' },
    { name: 'Pilmico Lactating Sow Pellet', animalType: 'pig' },

    // Uno
    { name: 'Uno Hog Pre-Starter', animalType: 'pig' },
    { name: 'Uno Hog Booster', animalType: 'pig' },
    { name: 'Uno Hog Starter', animalType: 'pig' },
    { name: 'Uno Hog Grower', animalType: 'pig' },
    { name: 'Uno Hog Finisher', animalType: 'pig' },
    { name: 'Uno Gestating Sow Pellet', animalType: 'pig' },
    { name: 'Uno Lactating Sow Pellet', animalType: 'pig' },

    // Hog-Gold
    { name: 'Hog-Gold Hog Pre-Starter', animalType: 'pig' },
    { name: 'Hog-Gold Hog Booster', animalType: 'pig' },
    { name: 'Hog-Gold Hog Starter', animalType: 'pig' },
    { name: 'Hog-Gold Hog Grower', animalType: 'pig' },
    { name: 'Hog-Gold Hog Finisher', animalType: 'pig' },

    // CJ
    { name: 'CJ Hog Premium Pre-Starter', animalType: 'pig' },
    { name: 'CJ Hog Premium Starter', animalType: 'pig' },
    { name: 'CJ Hog Premium Grower', animalType: 'pig' },
    { name: 'CJ Hog Premium Finisher', animalType: 'pig' },
    { name: 'CJ Gestating Sow Feed', animalType: 'pig' },
    { name: 'CJ Lactating Sow Feed', animalType: 'pig' },

    // Vitarich
    { name: 'Vitarich Hog Booster', animalType: 'pig' },
    { name: 'Vitarich Hog Starter', animalType: 'pig' },
    { name: 'Vitarich Hog Grower', animalType: 'pig' },
    { name: 'Vitarich Hog Finisher', animalType: 'pig' },

    // Robina
    { name: 'Robina Hog Booster', animalType: 'pig' },
    { name: 'Robina Hog Starter', animalType: 'pig' },
    { name: 'Robina Hog Grower', animalType: 'pig' },
    { name: 'Robina Hog Finisher', animalType: 'pig' },

    // ── Chickens (Manok - Broilers, Layers, Gamefowl) ───────────────
    // B-Meg / Integra
    { name: 'B-Meg Integra Chick Booster', animalType: 'chicken' },
    { name: 'B-Meg Integra Chick Starter', animalType: 'chicken' },
    { name: 'B-Meg Integra Poultry Grower', animalType: 'chicken' },
    { name: 'B-Meg Integra Broiler Finisher', animalType: 'chicken' },
    { name: 'B-Meg Integra 1000 Chick Booster Crumble', animalType: 'chicken' },
    { name: 'B-Meg Integra 2000 Poultry Grower Pellet', animalType: 'chicken' },
    { name: 'B-Meg Integra 3000 Broiler Finisher Pellet', animalType: 'chicken' },
    { name: 'B-Meg Premium Layer Mash', animalType: 'chicken' },
    { name: 'B-Meg Premium Layer Pellets', animalType: 'chicken' },
    { name: 'B-Meg Eggstra Layer Mash', animalType: 'chicken' },
    { name: 'B-Meg Breeder Mash', animalType: 'chicken' },

    // Purina
    { name: 'Purina Chick Booster', animalType: 'chicken' },
    { name: 'Purina Chick Starter', animalType: 'chicken' },
    { name: 'Purina Poultry Grower', animalType: 'chicken' },
    { name: 'Purina Broiler Finisher', animalType: 'chicken' },
    { name: 'Purina Layena Layer Mash', animalType: 'chicken' },
    { name: 'Purina Layena Layer Pellets', animalType: 'chicken' },

    // Pilmico Gallimax
    { name: 'Pilmico Gallimax Chick Booster', animalType: 'chicken' },
    { name: 'Pilmico Gallimax Chick Starter', animalType: 'chicken' },
    { name: 'Pilmico Gallimax Poultry Grower', animalType: 'chicken' },
    { name: 'Pilmico Gallimax Broiler Finisher', animalType: 'chicken' },
    { name: 'Pilmico Poultry Layer Mash', animalType: 'chicken' },
    { name: 'Pilmico Poultry Layer Pellets', animalType: 'chicken' },

    // Thunderbird
    { name: 'Thunderbird Baby Chick Booster', animalType: 'chicken' },
    { name: 'Thunderbird Chick Starter', animalType: 'chicken' },
    { name: 'Thunderbird Multi-Grain Grower', animalType: 'chicken' },
    { name: 'Thunderbird Platinum Layer', animalType: 'chicken' },
    { name: 'Thunderbird Successor Pellet', animalType: 'chicken' },
    { name: 'Thunderbird Enertone', animalType: 'chicken' },

    // Uno
    { name: 'Uno Chick Booster', animalType: 'chicken' },
    { name: 'Uno Poultry Starter', animalType: 'chicken' },
    { name: 'Uno Poultry Grower', animalType: 'chicken' },
    { name: 'Uno Broiler Finisher', animalType: 'chicken' },
    { name: 'Uno Layer Pellets', animalType: 'chicken' },

    // CJ
    { name: 'CJ Broiler Starter Crumble', animalType: 'chicken' },
    { name: 'CJ Broiler Grower Pellet', animalType: 'chicken' },
    { name: 'CJ Broiler Finisher Pellet', animalType: 'chicken' },

    // Vitarich
    { name: 'Vitarich Chick Booster', animalType: 'chicken' },
    { name: 'Vitarich Broiler Starter', animalType: 'chicken' },
    { name: 'Vitarich Broiler Grower', animalType: 'chicken' },
    { name: 'Vitarich Broiler Finisher', animalType: 'chicken' },
    { name: 'Vitarich Layer Mash', animalType: 'chicken' },

    // Robina
    { name: 'Robina Chick Booster', animalType: 'chicken' },
    { name: 'Robina Broiler Starter', animalType: 'chicken' },
    { name: 'Robina Broiler Grower', animalType: 'chicken' },
    { name: 'Robina Broiler Finisher', animalType: 'chicken' },
    { name: 'Robina Layer Mash', animalType: 'chicken' },
];

export const COMMON_CATEGORIES: CategoryOption[] = [
    // Pigs (Baboy)
    { name: 'Pre-Starter', animalType: 'pig' },
    { name: 'Booster', animalType: 'pig' },
    { name: 'Starter', animalType: 'pig' },
    { name: 'Piglet', animalType: 'pig' },
    { name: 'Grower', animalType: 'pig' },
    { name: 'Finisher', animalType: 'pig' },
    { name: 'Gestating', animalType: 'pig' },
    { name: 'Lactating', animalType: 'pig' },

    // Chickens (Manok)
    { name: 'Chick Booster', animalType: 'chicken' },
    { name: 'Chick Starter', animalType: 'chicken' },
    { name: 'Chick Crate', animalType: 'chicken' },
    { name: 'Grower', animalType: 'chicken' },
    { name: 'Finisher', animalType: 'chicken' },
    { name: 'Layer Mash', animalType: 'chicken' },
    { name: 'Layer Pellets', animalType: 'chicken' },
    { name: 'Breeder Mash', animalType: 'chicken' },
];

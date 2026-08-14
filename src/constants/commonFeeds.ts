export interface FeedOption {
    name: string;
    animalType: 'chicken' | 'pig';
}

export interface CategoryOption {
    name: string;
    animalType: 'chicken' | 'pig';
}

export const COMMON_FEEDS: FeedOption[] = [
    // Pigs (Baboy)
    { name: 'B-Meg Hog Booster', animalType: 'pig' },
    { name: 'B-Meg Hog Starter', animalType: 'pig' },
    { name: 'B-Meg Hog Grower', animalType: 'pig' },
    { name: 'B-Meg Hog Finisher', animalType: 'pig' },
    { name: 'Purina Hog Chow Pre-Starter', animalType: 'pig' },
    { name: 'Purina Hog Chow Starter', animalType: 'pig' },
    { name: 'Purina Hog Chow Grower', animalType: 'pig' },
    { name: 'Pilmico Hog Booster', animalType: 'pig' },
    { name: 'Pilmico Hog Starter', animalType: 'pig' },
    { name: 'Pilmico Hog Grower', animalType: 'pig' },
    { name: 'Uno Hog Starter', animalType: 'pig' },
    { name: 'Uno Hog Grower', animalType: 'pig' },
    { name: 'Hog-Gold Hog Booster', animalType: 'pig' },
    { name: 'Hog-Gold Hog Starter', animalType: 'pig' },
    { name: 'Hog-Gold Hog Grower', animalType: 'pig' },
    { name: 'CJ Hog Premium Starter', animalType: 'pig' },
    { name: 'CJ Hog Premium Grower', animalType: 'pig' },

    // Chickens (Manok)
    { name: 'B-Meg Integra Chick Booster', animalType: 'chicken' },
    { name: 'B-Meg Integra Chick Starter', animalType: 'chicken' },
    { name: 'B-Meg Integra Poultry Grower', animalType: 'chicken' },
    { name: 'B-Meg Integra Layer Pellets', animalType: 'chicken' },
    { name: 'Thunderbird Baby Chick Booster', animalType: 'chicken' },
    { name: 'Thunderbird Chick Starter', animalType: 'chicken' },
    { name: 'Thunderbird Multi-Grain Grower', animalType: 'chicken' },
    { name: 'Thunderbird Platinum Layer', animalType: 'chicken' },
    { name: 'Purina Chick Booster', animalType: 'chicken' },
    { name: 'Purina Poultry Grower', animalType: 'chicken' },
    { name: 'Pilmico Chick Booster', animalType: 'chicken' },
    { name: 'Pilmico Poultry Grower', animalType: 'chicken' },
    { name: 'Integra Chick Booster 1000', animalType: 'chicken' },
    { name: 'Integra Poultry Grower 2000', animalType: 'chicken' },
    { name: 'Uno Poultry Starter', animalType: 'chicken' },
    { name: 'Uno Poultry Grower', animalType: 'chicken' },
];

export const COMMON_CATEGORIES: CategoryOption[] = [
    // Pigs (Baboy)
    { name: 'Booster', animalType: 'pig' },
    { name: 'Pre-Starter', animalType: 'pig' },
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

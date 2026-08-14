export interface IllnessSuggestion {
    name: string;
    animalType: 'chicken' | 'pig' | 'all';
    commonMedications: string[];
}

export interface TreatmentSuggestion {
    name: string;
    animalType: 'chicken' | 'pig' | 'all';
    commonMedications: string[];
}

export interface VitaminSuggestion {
    name: string;
    animalType: 'chicken' | 'pig' | 'all';
}

export const ILLNESS_SUGGESTIONS: IllnessSuggestion[] = [
    // ── Chickens ──
    {
        name: 'Chronic Respiratory Disease (CRD)',
        animalType: 'chicken',
        commonMedications: ['Tylosin Tartrate', 'Doxycycline Hcl', 'L-Spec (Lincomycin-Spectinomycin)', 'Erythromycin'],
    },
    {
        name: 'Coccidiosis (Bloody Scours)',
        animalType: 'chicken',
        commonMedications: ['Amprolium', 'Toltrazuril', 'Sulfaquinoxaline', 'Sulfadiazine-Trimethoprim'],
    },
    {
        name: 'Infectious Coryza (Ples)',
        animalType: 'chicken',
        commonMedications: ['Vetracin Gold', 'Amoxicillin Trihydrate', 'Erythromycin', 'Enrofloxacin'],
    },
    {
        name: 'Fowl Cholera',
        animalType: 'chicken',
        commonMedications: ['Penicillin G', 'Oxytetracycline', 'Sulfadimidine', 'Chlortetracycline'],
    },
    {
        name: 'Colibacillosis (E. coli Infection)',
        animalType: 'chicken',
        commonMedications: ['Enrofloxacin', 'Norfloxacin', 'Gentamicin', 'Neomycin'],
    },
    {
        name: 'Crop Bound / Sour Crop',
        animalType: 'chicken',
        commonMedications: ['Mineral Oil', 'Nystatin (Antifungal)', 'Apple Cider Vinegar (diluted)'],
    },

    // ── Pigs ──
    {
        name: 'Scours / Colibacillosis (Diarrhea)',
        animalType: 'pig',
        commonMedications: ['Colistin Sulfate', 'Spectinomycin', 'Neomycin Sulfate', 'Trimethoprim-Sulfamethoxazole'],
    },
    {
        name: 'Swine Pneumonia / Respiratory Disease (PRDC)',
        animalType: 'pig',
        commonMedications: ['Tylosin Phosphate', 'Florfenicol', 'Enrofloxacin', 'Ceftiofur Sodium', 'Tulathromycin'],
    },
    {
        name: 'Mange / Scabies / Lice',
        animalType: 'pig',
        commonMedications: ['Ivermectin (Injection)', 'Doramectin (Dectomax)', 'Amitraz (Topical Wash)'],
    },
    {
        name: 'MMA Syndrome (Mastitis-Metritis-Agalactia)',
        animalType: 'pig',
        commonMedications: ['Penicillin-Streptomycin', 'Oxytocin (to stimulate milk)', 'Flunixin Meglumine (anti-inflammatory)'],
    },
    {
        name: 'Greasy Pig Disease (Exudative Epidermitis)',
        animalType: 'pig',
        commonMedications: ['Amoxicillin Injectable', 'Ceftiofur', 'Penicillin G', 'Chlorhexidine (topical wash)'],
    },
    {
        name: 'Swine Erysipelas',
        animalType: 'pig',
        commonMedications: ['Penicillin G (Drug of Choice)', 'Ampicillin', 'Tylosin'],
    },
];

export const TREATMENT_SUGGESTIONS: TreatmentSuggestion[] = [
    // ── Pigs ──
    {
        name: 'Iron Supplementation (3-day Piglets)',
        animalType: 'pig',
        commonMedications: ['Iron Dextran (Feradex)', 'Gleptosil'],
    },
    {
        name: 'Wound Dressing / Tail Docking care',
        animalType: 'pig',
        commonMedications: ['Gentian Violet (Blue Spray)', 'Terramycin Wound Spray', 'Povidone-Iodine'],
    },
    {
        name: 'Castration Aftercare',
        animalType: 'pig',
        commonMedications: ['Penicillin-Streptomycin Injectable', 'Iodine Solution', 'Antibiotic Wound Powder'],
    },
    {
        name: 'Fever & Inflammation Relief',
        animalType: 'pig',
        commonMedications: ['Ketoprofen', 'Flunixin Meglumine', 'Paracetamol Oral Solution'],
    },
    {
        name: 'De-worming Routine',
        animalType: 'pig',
        commonMedications: ['Ivermectin', 'Albendazole', 'Fenbendazole'],
    },

    // ── Chickens ──
    {
        name: 'Heat Stress / Dehydration Therapy',
        animalType: 'chicken',
        commonMedications: ['Electrolytes + Dextrose (Electrogen)', 'Vitamin C Soluble Powder'],
    },
    {
        name: 'Wound / Pecking Injury Disinfection',
        animalType: 'chicken',
        commonMedications: ['Povidone-Iodine', 'Wound Blue Spray', 'Terramycin Spray'],
    },
    {
        name: 'Deworming Routine',
        animalType: 'chicken',
        commonMedications: ['Piperazine Dewormer', 'Levamisole', 'Fenbendazole'],
    },
];

export const VITAMIN_SUGGESTIONS: VitaminSuggestion[] = [
    // ── Chickens ──
    { name: 'Electrolytes + Multivitamins (e.g., Selectrogen)', animalType: 'chicken' },
    { name: 'Vitamin B-Complex (e.g., Bexan XP)', animalType: 'chicken' },
    { name: 'Vitamin C / Ascorbic Acid Soluble', animalType: 'chicken' },
    { name: 'Vitamin ADE + Amino Acids (e.g., Amilyte)', animalType: 'chicken' },
    { name: 'Calcium + Vitamin D3 (for eggshell strength)', animalType: 'chicken' },

    // ── Pigs ──
    { name: 'Vitamin B-Complex + Iron (e.g., Bexan XP)', animalType: 'pig' },
    { name: 'Multivitamins Soluble Powder', animalType: 'pig' },
    { name: 'Vitamin ADE Injectable (e.g., Vetade)', animalType: 'pig' },
    { name: 'Oral Electrolyte Powder', animalType: 'pig' },
    { name: 'Growth Promoter Multivitamins', animalType: 'pig' },
];

export interface DewormingSuggestion {
    name: string;
    animalType: 'chicken' | 'pig' | 'all';
}

export const DEWORMING_SUGGESTIONS: DewormingSuggestion[] = [
    // ── Chickens ──
    { name: 'Piperazine Dewormer', animalType: 'chicken' },
    { name: 'Levamisole', animalType: 'chicken' },
    { name: 'Fenbendazole', animalType: 'chicken' },
    { name: 'Ivermectin (Off-label / backyard)', animalType: 'chicken' },

    // ── Pigs ──
    { name: 'Ivermectin (Injection / Premix)', animalType: 'pig' },
    { name: 'Albendazole', animalType: 'pig' },
    { name: 'Fenbendazole', animalType: 'pig' },
    { name: 'Piperazine', animalType: 'pig' },
];

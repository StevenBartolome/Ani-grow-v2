export interface ActionDetail {
    label: string;
    icon: string;
    text: string;
}

export interface SOPAction {
    action: string;
    dayTag: string; // e.g. "Pre-Arrival", "Day 1", "Day 3", "Day 1–5", "Day 6–10", etc.
}

export interface GuidePhaseItem {
    id: string;
    name: string;
    dayRange: string;
    dayStart: number;
    dayEnd: number;
    targetTemp: string;
    targetWeight: string;
    targetWeightMin?: number;
    targetWeightMax?: number;
    targetTempMin?: number;
    targetTempMax?: number;
    timelineDescription: string;
    cardDescription: string;
    actionable: string;
    todayAction: string;
    actionDetails: ActionDetail[];
    aiRecommendation: string;
    fullGuideActions: SOPAction[];
    // Versioning metadata
    version?: number;
    is_ai_adjusted?: boolean;
    ai_reason?: string;
    batch_id?: string | null;
}

export const PIG_GUIDE_DATA: GuidePhaseItem[] = [
    {
        id: 'arrival',
        name: 'Arrival Phase',
        dayRange: 'DAY 1–5',
        dayStart: 1,
        dayEnd: 5,
        targetTemp: '32°C – 34°C',
        targetWeight: '1.2 – 2.0 kg',
        targetWeightMin: 1.2,
        targetWeightMax: 2.0,
        targetTempMin: 32,
        targetTempMax: 34,
        timelineDescription: 'Piglets received. Housing must be disinfected and pre-warmed. Provide highly digestible starter feed.',
        cardDescription: 'Piglets received and settling in. Focus on thermal comfort, hydration, and neonatal disease prevention.',
        actionable: 'Action: Monitor carefully for signs of scouring (diarrhea). Provide constant access to fresh water.',
        todayAction: 'Monitor carefully for signs of scouring (diarrhea). Provide constant access to fresh water.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Pre-warm brooding pens to 32°C–34°C with infrared lamps. Eliminate cold floor drafts and maintain clean, dry bedding.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'water_drop',
                text: 'Supply clean water fortified with Apralyte electrolytes & glucose. Offer Early Wean ImmunoBooster in small, frequent portions.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Dip umbilical cords in iodine. Administer Day 3 iron dextran injection (1 mL IM) to prevent neonatal anemia.',
            },
        ],
        aiRecommendation: 'Early gut flora stabilization is critical during the first 5 days. Ensure brooder temperature remains at 32°C without fluctuations, and check nipple drinkers twice daily to guarantee unimpeded fresh water access.',
        fullGuideActions: [
            { action: 'Clean and thoroughly disinfect housing and pens at least 48 hours prior to arrival.', dayTag: 'Pre-Arrival' },
            { action: 'Pre-warm the brooding area with proper heat lamps to maintain 32°C–34°C.', dayTag: 'Day 1' },
            { action: 'Ensure clean, dry bedding free of dampness and cold drafts.', dayTag: 'Day 1' },
            { action: 'Provide constant access to fresh water with electrolytes immediately upon arrival.', dayTag: 'Day 1' },
            { action: 'Introduce highly digestible starter/creep feed in small, frequent portions.', dayTag: 'Day 2' },
            { action: 'Administer iron injection on Day 3 to prevent anemia.', dayTag: 'Day 3' },
            { action: 'Monitor closely for signs of scouring (diarrhea) and isolate weak piglets.', dayTag: 'Day 1–5' },
        ],
    },
    {
        id: 'starter',
        name: 'Starter Phase',
        dayRange: 'DAY 6–30',
        dayStart: 6,
        dayEnd: 30,
        targetTemp: '28°C – 30°C',
        targetWeight: '6.0 – 18.0 kg',
        targetWeightMin: 6.0,
        targetWeightMax: 18.0,
        targetTempMin: 28,
        targetTempMax: 30,
        timelineDescription: 'First month transition. Gut biome is adapting. High protein required for skeletal frame growth.',
        cardDescription: 'First month transition. Gut biome is adapting rapidly. Strict pen hygiene and gradual creep feeding required.',
        actionable: 'Action: Maintain strict pen hygiene. Introduce creeping feeder pellets gradually to avoid digestive shock.',
        todayAction: 'Maintain strict pen hygiene. Introduce creeping feeder pellets gradually to avoid digestive shock.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Gradually reduce brooding temperature by 2°C weekly towards 28°C. Maintain dry slatted floors to prevent bacteria.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Feed Early Wean Super Start pellets (min 20% protein). Clean feeder pans twice daily to keep rations fresh and palatable.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Administer Day 14 Mycoplasma and Circovirus (PCV2) vaccinations. Sample-weigh 10% of litter to verify ADG > 350g/day.',
            },
        ],
        aiRecommendation: 'Gut microbiome transition in progress. Avoid abrupt feed formula changes. Nipple drinker flow rate should be tested and maintained at 500 mL/min to support digestion.',
        fullGuideActions: [
            { action: 'Maintain strict pen hygiene and remove damp bedding daily.', dayTag: 'Day 6–30' },
            { action: 'Introduce creeping feeder pellets gradually to allow gut biome adaptation.', dayTag: 'Day 6–10' },
            { action: 'Gradually reduce brooding heat by approximately 2°C per week towards ambient levels.', dayTag: 'Day 7–21' },
            { action: 'Ensure nipple drinkers are at shoulder height with adequate water pressure.', dayTag: 'Day 10' },
            { action: 'Schedule core vaccinations (Mycoplasma and PCV2) around Day 14–21.', dayTag: 'Day 14' },
            { action: 'Track daily feed intake and sample weigh pigs to verify active weight gain.', dayTag: 'Day 20–30' },
        ],
    },
    {
        id: 'grower',
        name: 'Grower Phase',
        dayRange: 'DAY 31–90',
        dayStart: 31,
        dayEnd: 90,
        targetTemp: '22°C – 25°C',
        targetWeight: '25.0 – 60.0 kg',
        targetWeightMin: 25.0,
        targetWeightMax: 60.0,
        targetTempMin: 22,
        targetTempMax: 25,
        timelineDescription: 'Intense lean muscle growth period. Feed converted efficiently to muscle mass. Weekly weighing is ideal.',
        cardDescription: 'Intense lean muscle growth period. Feed converted efficiently to muscle mass. Weekly weighing is recommended.',
        actionable: 'Action: Scale up feed volume significantly. Ensure cooling misting systems are operational during hot days.',
        todayAction: 'Scale up feed volume significantly. Ensure cooling misting systems are operational during hot days.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Maintain pen temperature at 22°C–25°C. Provide minimum 0.8 m² floor space per animal to prevent crowding stress.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Switch to high-protein Premium Hog Grower formula (1.2–1.8 kg/head/day). Ensure uninterrupted fresh water (4L per kg of feed).',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Administer scheduled broad-spectrum deworming (Ivermectin) at Day 45. Monitor skin for mange or pen scratching.',
            },
        ],
        aiRecommendation: 'Growth velocity is peaking with optimal Feed Conversion Ratio (~2.2). Weekly scale weighing is recommended to detect weight distribution outliers early.',
        fullGuideActions: [
            { action: 'Transition to grower feed formula balanced for muscle growth.', dayTag: 'Day 31–35' },
            { action: 'Scale up daily feed volume in proportion to body weight.', dayTag: 'Day 36–60' },
            { action: 'Perform scheduled deworming around Day 45.', dayTag: 'Day 45' },
            { action: 'Ensure adequate stocking space (minimum 0.8 m² per head) to prevent overcrowding.', dayTag: 'Day 50' },
            { action: 'Ensure proper ventilation and activate pen cooling or misting on hot afternoons.', dayTag: 'Day 31–90' },
            { action: 'Conduct weekly batch sample weighing to detect outliers early.', dayTag: 'Day 60–90' },
        ],
    },
    {
        id: 'finisher',
        name: 'Finisher Phase',
        dayRange: 'DAY 91–120',
        dayStart: 91,
        dayEnd: 120,
        targetTemp: '18°C – 22°C',
        targetWeight: '65.0 – 95.0 kg',
        targetWeightMin: 65.0,
        targetWeightMax: 95.0,
        targetTempMin: 18,
        targetTempMax: 22,
        timelineDescription: 'Approaching final target market weight. Diet shifted towards higher energy to build fat reserves.',
        cardDescription: 'Approaching final target market weight. Diet shifted towards higher energy to build lean finish and market weight.',
        actionable: 'Action: Monitor pen density as pigs grow rapidly. Sort and segregate by size if necessary to prevent bullying.',
        todayAction: 'Monitor pen density as pigs grow rapidly. Sort and segregate by size if necessary to prevent bullying.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Keep pens cool (below 24°C) as heavy hogs generate excess body heat. Ensure heavy-duty pen gates and non-slip floors.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Transition to Premium Hog Finisher diet (2.0–2.4 kg/head/day) to build muscle finish and uniform backfat.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Strictly adhere to medication withdrawal periods (minimum 14–21 days before slaughter). Inspect leg joints and foot integrity.',
            },
        ],
        aiRecommendation: 'Top 25% of batch is approaching 88–92 kg market weight. Group segregation is recommended to optimize feed efficiency for slower eaters.',
        fullGuideActions: [
            { action: 'Shift diet to finisher feed to achieve target market fat and carcass yield.', dayTag: 'Day 91–95' },
            { action: 'Sort and segregate pigs by size to prevent bullying at the feeder.', dayTag: 'Day 96–100' },
            { action: 'Verify water drinkers deliver at least 1.5 L/min flow rate.', dayTag: 'Day 100' },
            { action: 'Strictly observe and document medication and antibiotic withdrawal periods.', dayTag: 'Day 105–120' },
            { action: 'Calibrate scales and tag market-ready animals reaching 90+ kg.', dayTag: 'Day 115–120' },
        ],
    },
    {
        id: 'mature',
        name: 'Mature Phase',
        dayRange: 'DAY 121+',
        dayStart: 121,
        dayEnd: 150,
        targetTemp: '18°C – 22°C',
        targetWeight: '95.0 – 110.0 kg',
        targetWeightMin: 95.0,
        targetWeightMax: 110.0,
        targetTempMin: 18,
        targetTempMax: 22,
        timelineDescription: 'Target weight reached (approx 90–100kg); ready for sale or slaughter.',
        cardDescription: 'Target market weight reached (approx 90–100kg); ready for sale or harvest processing.',
        actionable: 'Action: Restrict feed 12–18 hours prior to transport. Organize quiet and low-stress loading.',
        todayAction: 'Restrict feed 12–18 hours prior to transport. Organize quiet and low-stress loading.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Prepare clean, disinfected loading ramps with rubber non-slip mats. Avoid loading animals during hot midday sun.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Withhold solid feed 12–18 hours before hauling to minimize transport mortality, but provide continuous fresh water until loading.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Confirm target slaughter weight (90–105 kg). Verify veterinary health inspection clearance and transit manifests.',
            },
        ],
        aiRecommendation: 'Batch has reached peak commercial profitability. Feed conversion efficiency drops sharply past Day 125. Execute haul schedule for peak farm returns.',
        fullGuideActions: [
            { action: 'Confirm final live weights (target 90–105 kg body weight).', dayTag: 'Day 121–125' },
            { action: 'Disinfect transport trucks, ramps, and loading facilities.', dayTag: 'Day 125–130' },
            { action: 'Withhold solid feed 12–18 hours prior to transport to minimize transport stress (keep water available).', dayTag: 'Pre-Haul' },
            { action: 'Organize calm, quiet loading during cooler morning or evening hours.', dayTag: 'Harvest Day' },
            { action: 'Complete batch clearance and harvest documentation in AniGrow.', dayTag: 'Harvest Day' },
        ],
    },
];

export const CHICKEN_GUIDE_DATA: GuidePhaseItem[] = [
    {
        id: 'arrival',
        name: 'Arrival Phase',
        dayRange: 'DAY 1–7',
        dayStart: 1,
        dayEnd: 7,
        targetTemp: '32°C – 35°C',
        targetWeight: '42g – 180g',
        targetWeightMin: 0.042,
        targetWeightMax: 0.18,
        targetTempMin: 32,
        targetTempMax: 35,
        timelineDescription: 'Newly arrived chicks. Ensure brooding temp is ~32–35°C. Provide clean water with electrolytes immediately upon arrival.',
        cardDescription: 'Newly arrived day-old chicks. Brooding environment, initial hydration, and crop fill are paramount.',
        actionable: 'Action: Inspect for weak chicks and isolate. Keep feed easily accessible on flat trays.',
        todayAction: 'Inspect for weak chicks and isolate. Keep feed easily accessible on flat trays.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Pre-warm brooding house 24h in advance (target 32°C–34°C floor litter temp). Provide 23 hours of bright light (30 lux).',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'water_drop',
                text: 'Distribute warm water with electrolytes and 5% dextrose immediately. Spread Pre-Starter crumble on paper over 50% of floor.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Perform 8-hour crop fill check (target: >85% full and soft). Administer Newcastle (ND-B1) + Bronchitis eye drops on Day 1.',
            },
        ],
        aiRecommendation: 'Monitor chick dispersion under brooder lamps. Uniform distribution confirms thermal comfort; clustering tightly indicates chilling, while panting at edges indicates overheating.',
        fullGuideActions: [
            { action: 'Pre-heat the brooding area 24 hours prior to chick delivery (floor temp 32°C–34°C).', dayTag: 'Pre-Arrival' },
            { action: 'Ensure clean, dry bedding litter (rice hulls or wood shavings) across the brooding ring.', dayTag: 'Day 1' },
            { action: 'Distribute fresh drinking water with electrolytes and 5% glucose immediately upon arrival.', dayTag: 'Day 1' },
            { action: 'Provide starter feed on flat paper trays so all chicks can find feed readily.', dayTag: 'Day 1' },
            { action: 'Administer initial Newcastle (ND-B1) + Bronchitis eye drops.', dayTag: 'Day 1' },
            { action: 'Perform 8-hour crop fill check (target: >85% full and soft).', dayTag: 'Day 2' },
            { action: 'Check chick distribution: even circle indicates ideal temperature; crowding indicates cold.', dayTag: 'Day 1–7' },
        ],
    },
    {
        id: 'starter',
        name: 'Starter Phase',
        dayRange: 'DAY 8–14',
        dayStart: 8,
        dayEnd: 14,
        targetTemp: '29°C – 31°C',
        targetWeight: '200g – 480g',
        targetWeightMin: 0.2,
        targetWeightMax: 0.48,
        targetTempMin: 29,
        targetTempMax: 31,
        timelineDescription: 'Crucial for early organ and bone development. Focus on high-protein (min 21%) Starter Mash.',
        cardDescription: 'Crucial for early organ and bone development. Focus on high-protein (min 21%) Starter Mash.',
        actionable: 'Action: Gradually increase ventilation. Expand feeding space to prevent overcrowding at feeders.',
        todayAction: 'Gradually increase ventilation. Expand feeding space to prevent overcrowding at feeders.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Lower temperature by 3°C to 29°C–30°C. Run minimum ventilation timer to vent humidity and keep ammonia < 10 ppm.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Transition from paper feeding to automated tube or pan feeders. Provide Starter Mash containing min 21% crude protein.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Administer Gumboro (IBD) vaccine in drinking water around Day 12. Rake litter to prevent wet caking.',
            },
        ],
        aiRecommendation: 'Ensure drinker bell height is level with bird backs. Maintain 4 hours of darkness daily for skeletal frame strength and metabolic rest.',
        fullGuideActions: [
            { action: 'Gradually lower house temperature by 2°C–3°C from brooding level towards 29°C–30°C.', dayTag: 'Day 8' },
            { action: 'Transition chicks from paper trays to automatic pan or tube feeders.', dayTag: 'Day 8–10' },
            { action: 'Increase ventilation slightly to remove moisture and ammonia while avoiding cold drafts.', dayTag: 'Day 10–14' },
            { action: 'Administer Gumboro (IBD) vaccine in drinking water around Day 12–14.', dayTag: 'Day 12' },
            { action: 'Turn litter bedding to prevent wet spots and caking.', dayTag: 'Day 8–14' },
        ],
    },
    {
        id: 'booster',
        name: 'Booster Phase',
        dayRange: 'DAY 15–25',
        dayStart: 15,
        dayEnd: 25,
        targetTemp: '24°C – 26°C',
        targetWeight: '500g – 1.25 kg',
        targetWeightMin: 0.5,
        targetWeightMax: 1.25,
        targetTempMin: 24,
        targetTempMax: 26,
        timelineDescription: 'Feed upgraded to Grower pellets as rapid muscle development accelerates. Monitor weight gains strictly.',
        cardDescription: 'Feed upgraded to Grower pellets as rapid muscle development accelerates. Monitor weight gains strictly.',
        actionable: 'Action: Lower temperatures to ambient levels. Shift to hanging feeders to prevent feed waste.',
        todayAction: 'Lower temperatures to ambient levels. Shift to hanging feeders to prevent feed waste.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Maintain house temperature at 24°C–26°C. Increase cross-ventilation as bird biomass increases.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Switch to Grower pellets with anticoccidial protection (70–110g/bird/day). Monitor water meter daily.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Sample weigh 50 birds weekly to verify flock uniformity (>85% target). Check plumage and hock joints.',
            },
        ],
        aiRecommendation: 'Flock uniformity is high (88%). Water-to-feed consumption ratio is optimal at 1.8:1. Raise feeder lines by 2 inches to match bird growth.',
        fullGuideActions: [
            { action: 'Transition feed to grower pellets containing anticoccidial protection.', dayTag: 'Day 15–17' },
            { action: 'Adjust bell drinker and feeder heights as birds gain height to prevent spillage.', dayTag: 'Day 18' },
            { action: 'Provide 4 to 6 hours of darkness daily for bone strength and metabolic rest.', dayTag: 'Day 15–25' },
            { action: 'Sample weigh 50 birds to check flock uniformity (>85% target).', dayTag: 'Day 21' },
            { action: 'Ensure continuous clean water supply with weekly line flushing.', dayTag: 'Day 25' },
        ],
    },
    {
        id: 'finisher',
        name: 'Finisher Phase',
        dayRange: 'DAY 26–35',
        dayStart: 26,
        dayEnd: 35,
        targetTemp: '20°C – 22°C',
        targetWeight: '1.3 kg – 2.0 kg',
        targetWeightMin: 1.3,
        targetWeightMax: 2.0,
        targetTempMin: 20,
        targetTempMax: 22,
        timelineDescription: 'Approaching target harvest weight. Feed energy density is prioritized over protein for fat marbling.',
        cardDescription: 'Approaching target harvest weight. Feed energy density is prioritized over protein for fat marbling.',
        actionable: 'Action: Ensure maximum water flow rate. Minimize flock disturbances to reduce stress metabolism.',
        todayAction: 'Ensure maximum water flow rate. Minimize flock disturbances to reduce stress metabolism.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Run tunnel ventilation fans and evaporative cooling pads during hot afternoon peaks (12 PM–4 PM).',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Transition to finisher withdrawal pellets with zero medicated additives. Provide high-flow drinker nipples.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Inspect footpads and hocks for bedding burns. Keep litter dry by replacing wet spots around drinkers.',
            },
        ],
        aiRecommendation: 'Afternoon temperature peaks expected. Increase tunnel air velocity to maintain cooling wind-chill effect and prevent heat stress mortality.',
        fullGuideActions: [
            { action: 'Transition to finisher withdrawal feed with zero medicated additives.', dayTag: 'Day 26–28' },
            { action: 'Run tunnel ventilation fans and cooling pads during afternoon peak heat.', dayTag: 'Day 26–35' },
            { action: 'Monitor water-to-feed consumption ratio daily.', dayTag: 'Day 28–35' },
            { action: 'Inspect litter condition to prevent footpad lesions and breast blisters.', dayTag: 'Day 30' },
            { action: 'Conduct sample weighing to estimate harvest yield.', dayTag: 'Day 33–35' },
        ],
    },
    {
        id: 'mature',
        name: 'Mature Phase',
        dayRange: 'DAY 36+',
        dayStart: 36,
        dayEnd: 45,
        targetTemp: '18°C – 20°C',
        targetWeight: '1.9 kg – 2.4 kg',
        targetWeightMin: 1.9,
        targetWeightMax: 2.4,
        targetTempMin: 18,
        targetTempMax: 20,
        timelineDescription: 'Target weight reached (approx 1.8–2.4kg); birds are finalized for sale or processing.',
        cardDescription: 'Target weight reached (approx 1.8–2.4kg); birds are finalized for sale or processing.',
        actionable: 'Action: Prepare harvest schedule and sanitize bio-secure transfer crates.',
        todayAction: 'Prepare harvest schedule and sanitize bio-secure transfer crates.',
        actionDetails: [
            {
                label: 'Housing & Climate',
                icon: 'thermostat',
                text: 'Dim house lights to blue/dark red 30 minutes before catching to keep birds calm and prevent wing injuries.',
            },
            {
                label: 'Nutrition & Feed',
                icon: 'restaurant',
                text: 'Execute feed withdrawal 8–10 hours prior to processing to prevent crop rupture, while maintaining continuous clean water.',
            },
            {
                label: 'Health & Care',
                icon: 'medical_services',
                text: 'Disinfect all transport crates and flatbed trucks. Record final flock liveweight and mortality clearances.',
            },
        ],
        aiRecommendation: 'Target harvest weight (2.15 kg) achieved. Schedule catching during cool night hours to minimize transport shrink and prevent heat buildup in coops.',
        fullGuideActions: [
            { action: 'Confirm final live weights (target 1.9–2.4 kg body weight).', dayTag: 'Day 36–38' },
            { action: 'Disinfect all transport crates and flatbed vehicles.', dayTag: 'Day 38–40' },
            { action: 'Withdraw feed 8–10 hours prior to catching (maintain continuous clean drinking water).', dayTag: 'Pre-Catch' },
            { action: 'Dim house lighting to blue/dim level before catching to keep birds calm.', dayTag: 'Harvest Day' },
            { action: 'Carefully load birds upright without crowding to prevent bruising or wing injury.', dayTag: 'Harvest Day' },
            { action: 'Record final liveweight and mortality clearances in AniGrow.', dayTag: 'Harvest Day' },
        ],
    },
];

export const DEMO_BATCHES = [
    {
        id: 'demo-pig-1',
        name: 'Travis Pig',
        animal_type: 'pig' as const,
        current_count: 32,
        arrival_date: new Date().toISOString().split('T')[0],
        age_at_arrival_days: 1,
        housings: { name: 'Pen A - Nursery' },
    },
    {
        id: 'demo-pig-2',
        name: 'Batch Alpha (Growers)',
        animal_type: 'pig' as const,
        current_count: 48,
        arrival_date: new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        age_at_arrival_days: 1,
        housings: { name: 'Pen B - Grower Bay' },
    },
    {
        id: 'demo-chicken-1',
        name: 'Broiler Flock Alpha',
        animal_type: 'chicken' as const,
        current_count: 500,
        arrival_date: new Date().toISOString().split('T')[0],
        age_at_arrival_days: 1,
        housings: { name: 'Coop 1 - Brooder' },
    },
    {
        id: 'demo-chicken-2',
        name: 'Broiler Flock Beta',
        animal_type: 'chicken' as const,
        current_count: 650,
        arrival_date: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        age_at_arrival_days: 1,
        housings: { name: 'Coop 2 - Grower' },
    },
];

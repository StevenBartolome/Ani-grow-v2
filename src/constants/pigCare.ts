/**
 * Client-side pig care guide data.
 * Mirrors the constants in supabase/functions/ai-farm-assistant/index.ts
 * Used for INSTANT, zero-API-cost recommendations inside any screen.
 */

export interface FeedingStage {
  stage: string;
  days_start: number;
  days_end: number;
  product: string | null;
  amount_per_day: string;
  notes: string;
}

export interface CareScheduleItem {
  day_start: number;
  day_end: number;
  action: string;
  purpose: string;
  medication: string | null;
  dosage: string | null;
  route: string | null;
  tasks?: string;
  conditional?: string;
}

// ─── Feeding stages ───────────────────────────────────────────────────────────

export const PIG_FEEDING_STAGES: FeedingStage[] = [
  {
    stage: 'Newborn',
    days_start: 0, days_end: 4,
    product: null,
    amount_per_day: 'Colostrum only (sow milk)',
    notes: 'Ensure all piglets nurse colostrum within the first 6 hours of birth.',
  },
  {
    stage: 'Booster',
    days_start: 5, days_end: 35,
    product: 'Early Wean IMMUNOBOOSTER',
    amount_per_day: '50–70 grams per piglet',
    notes: 'Begin creep feeding to prepare piglets for weaning.',
  },
  {
    stage: 'Pre-Starter',
    days_start: 36, days_end: 60,
    product: 'Early Wean SUPER START',
    amount_per_day: '500–700 grams per pig',
    notes: 'Transition feed immediately after weaning.',
  },
  {
    stage: 'Starter',
    days_start: 61, days_end: 90,
    product: 'PIGROLAC Premium Hog Starter',
    amount_per_day: '1.0–1.2 kg per pig',
    notes: 'Switch when pigs reach approx. 18–20 kg body weight (around 2 months old).',
  },
  {
    stage: 'Grower',
    days_start: 91, days_end: 120,
    product: 'PIGROLAC Premium Hog Grower',
    amount_per_day: '1.7–2.0 kg per pig',
    notes: '',
  },
  {
    stage: 'Finisher',
    days_start: 121, days_end: 9999,
    product: 'PIGROLAC Premium Hog Finisher',
    amount_per_day: '2.0–2.2 kg per pig',
    notes: '',
  },
];

// ─── Care schedule ────────────────────────────────────────────────────────────

export const PIG_CARE_SCHEDULE: CareScheduleItem[] = [
  {
    day_start: 1, day_end: 3,
    action: 'Newborn care tasks',
    purpose: 'Basic care and hygiene',
    medication: null, dosage: null, route: null,
    tasks: 'Clean piglet, ensure colostrum intake, clip needle teeth, cut navel cord, dock tail',
  },
  {
    day_start: 1, day_end: 3,
    action: 'Diarrhea prevention',
    purpose: 'Prevent scours/diarrhea in newborns',
    medication: 'APRALYTE', dosage: 'Mix 2 tbsp in 40 mL water; 1 mL per piglet', route: 'Oral (drench)',
  },
  {
    day_start: 3, day_end: 3,
    action: 'Iron injection',
    purpose: 'Prevent anemia and stunting',
    medication: 'JECTRAN PREMIUM with ZINC', dosage: '1 mL per piglet', route: 'IM Injection',
  },
  {
    day_start: 10, day_end: 10,
    action: 'Growth boost injection',
    purpose: 'Stimulate faster growth',
    medication: 'BEXAN SP', dosage: '1 mL per piglet', route: 'IM Injection',
  },
  {
    day_start: 10, day_end: 14,
    action: 'Disease prevention + castration of boar piglets',
    purpose: 'Strengthen immunity',
    medication: 'VETRACIN PREMIUM', dosage: '2 tsp per gallon of drinking water', route: 'In-water',
  },
  {
    day_start: 14, day_end: 14,
    action: 'Iron booster shot',
    purpose: 'Prevent anemia; strengthen immunity',
    medication: 'JECTRAN PREMIUM with ZINC', dosage: '1 mL per piglet', route: 'IM Injection',
  },
  {
    day_start: 21, day_end: 21,
    action: 'Hog Cholera vaccination',
    purpose: 'Protection against Hog Cholera (Classical Swine Fever)',
    medication: 'COGLAPEST', dosage: '2 mL per piglet', route: 'Injection',
  },
  {
    day_start: 23, day_end: 33,
    action: 'Pre-weaning stress reduction',
    purpose: 'Reduce weaning stress',
    medication: 'DIGESTIAIDE 4X', dosage: '2 tsp per gallon of drinking water', route: 'In-water',
  },
  {
    day_start: 25, day_end: 25,
    action: 'Pre-weaning growth booster',
    purpose: 'Prepare piglets for weaning',
    medication: 'BEXAN SP', dosage: '1 mL per piglet', route: 'IM Injection',
  },
  {
    day_start: 35, day_end: 35,
    action: 'Deworming',
    purpose: 'Remove intestinal worms that slow growth',
    medication: 'LATIGO-1000', dosage: '1 sachet per 10 piglets; mix in water or feed', route: 'Oral / In-feed',
  },
  {
    day_start: 36, day_end: 42,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD', dosage: '2 tsp per gallon of drinking water', route: 'In-water',
  },
  {
    day_start: 42, day_end: 42,
    action: 'Hog Cholera booster vaccination',
    purpose: 'Booster shot for Hog Cholera',
    medication: 'COGLAPEST', dosage: '2 mL per head', route: 'Injection',
  },
  {
    day_start: 60, day_end: 60,
    action: 'Growth boost injection',
    purpose: 'Stimulate fast growth',
    medication: 'BEXAN SP', dosage: '3 mL per head', route: 'IM Injection',
  },
  {
    day_start: 66, day_end: 72,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD', dosage: '2 tsp per gallon of drinking water', route: 'In-water',
  },
  {
    day_start: 66, day_end: 72,
    action: 'Deworming',
    purpose: 'Remove worms that slow growth',
    medication: 'LATIGO-1000', dosage: '1 sachet per 3 growers; mix in water or feed', route: 'Oral / In-feed',
  },
  {
    day_start: 96, day_end: 102,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD', dosage: '2 tsp per gallon of drinking water', route: 'In-water',
  },
  {
    day_start: 115, day_end: 120,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD', dosage: '2 tsp per gallon of drinking water', route: 'In-water',
  },
];

// ─── Recommendation output type ───────────────────────────────────────────────

export interface PigCareRecommendation {
  ageDays: number;
  feedStage: string;
  feedProduct: string | null;
  dailyAmount: string;
  feedNotes: string;
  dueNow: CareScheduleItem[];      // ±3 days of current age
  upcoming: CareScheduleItem[];    // next 7 days
  recentlyOverdue: CareScheduleItem[]; // past 4 days (missed window)
}

// ─── Compute recommendation (zero API cost) ───────────────────────────────────

const CURRENT_WINDOW = 3;  // ±3 days = "due now"
const UPCOMING_DAYS  = 7;  // look 7 days ahead
const PAST_DAYS      = 4;  // warn about items missed in last 4 days

export function computePigCareRecommendation(ageDays: number): PigCareRecommendation {
  const age = Math.max(0, Math.floor(ageDays));

  const feedStage =
    PIG_FEEDING_STAGES.find(s => age >= s.days_start && age <= s.days_end) ??
    PIG_FEEDING_STAGES[PIG_FEEDING_STAGES.length - 1];

  const dueNow: CareScheduleItem[]          = [];
  const upcoming: CareScheduleItem[]        = [];
  const recentlyOverdue: CareScheduleItem[] = [];

  for (const item of PIG_CARE_SCHEDULE) {
    const isCurrent  = item.day_end   >= age - CURRENT_WINDOW && item.day_start <= age + CURRENT_WINDOW;
    const isUpcoming = item.day_start >  age + CURRENT_WINDOW && item.day_start <= age + UPCOMING_DAYS;
    const isOverdue  = item.day_end   >= age - PAST_DAYS      && item.day_end   <  age - CURRENT_WINDOW;

    if (isCurrent)       dueNow.push(item);
    else if (isUpcoming) upcoming.push(item);
    else if (isOverdue)  recentlyOverdue.push(item);
  }

  return {
    ageDays: age,
    feedStage: feedStage.stage,
    feedProduct: feedStage.product,
    dailyAmount: feedStage.amount_per_day,
    feedNotes: feedStage.notes,
    dueNow,
    upcoming,
    recentlyOverdue,
  };
}

/** Utility: compute current age in days from batch data */
export function computeAgeDays(arrivalDate: string, ageAtArrivalDays: number): number {
  const arrival = new Date(arrivalDate);
  const today   = new Date();
  arrival.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - arrival.getTime()) / 86_400_000);
  return Math.max(0, diffDays) + (ageAtArrivalDays || 0);
}

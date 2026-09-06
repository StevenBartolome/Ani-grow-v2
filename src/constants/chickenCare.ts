/**
 * Client-side broiler chicken care guide data.
 * Mirrors the structure of pigCare.ts so GuideScreen can show the same
 * concrete, day-by-day "what to do now" detail for chickens that pigs
 * already had — instead of a single static one-line tip per phase.
 * Used for INSTANT, zero-API-cost recommendations inside any screen.
 */
import { FeedingStage, CareScheduleItem, PigCareRecommendation } from './pigCare';

// ─── Feeding stages ───────────────────────────────────────────────────────────
// Day ranges line up with the CHICKEN_PHASES timeline already used in GuideScreen.

export const CHICKEN_FEEDING_STAGES: FeedingStage[] = [
  {
    stage: 'Arrival / Pre-Starter',
    days_start: 0, days_end: 7,
    product: 'Chick Booster Mash (20-22% CP)',
    amount_per_day: '10–15 grams per chick, increasing daily',
    notes: 'Add electrolytes + vitamins to drinking water for the first 3 days to offset transit stress.',
  },
  {
    stage: 'Starter',
    days_start: 8, days_end: 14,
    product: 'Starter Mash / Crumbles (20-22% CP)',
    amount_per_day: '20–40 grams per bird',
    notes: 'Keep feed on flat trays or egg-crate lids until birds are reliably eating from feeders.',
  },
  {
    stage: 'Grower (Booster)',
    days_start: 15, days_end: 25,
    product: 'Grower Pellets (18-20% CP)',
    amount_per_day: '50–90 grams per bird',
    notes: 'Shift to hanging feeders to cut feed wastage as intake rises sharply.',
  },
  {
    stage: 'Finisher',
    days_start: 26, days_end: 42,
    product: 'Finisher Pellets (16-18% CP, higher energy)',
    amount_per_day: '100–150 grams per bird',
    notes: 'Prioritize energy density over protein for fat marbling and final weight gain.',
  },
  {
    stage: 'Mature / Withdrawal',
    days_start: 43, days_end: 9999,
    product: 'Withdrawal Feed (no antibiotics/medication)',
    amount_per_day: '150+ grams per bird',
    notes: 'Any medicated feed must be withdrawn per label before harvest — confirm withdrawal period.',
  },
];

// ─── Care schedule ────────────────────────────────────────────────────────────
// Standard broiler vaccination/medication protocol. Vaccine strain names are
// generic (e.g. "LaSota") — always confirm exact products with your supplier/vet.

export const CHICKEN_CARE_SCHEDULE: CareScheduleItem[] = [
  {
    day_start: 1, day_end: 1,
    action: "Confirm Marek's Disease vaccination",
    purpose: 'Protect against Marek\'s Disease',
    medication: "Marek's Disease Vaccine", dosage: 'Usually given at the hatchery before delivery', route: 'Subcutaneous (hatchery)',
    conditional: 'Confirm with your chick supplier this was already done — do not re-dose without checking.',
  },
  {
    day_start: 1, day_end: 3,
    action: 'Electrolyte + vitamin support',
    purpose: 'Reduce transit/brooding stress, boost early survivability',
    medication: 'Electrolyte + Vitamin premix', dosage: 'Per label, in drinking water', route: 'In-water',
  },
  {
    day_start: 5, day_end: 7,
    action: 'Newcastle Disease + Infectious Bronchitis vaccination',
    purpose: 'Protect against Newcastle Disease (ND) and Infectious Bronchitis (IB)',
    medication: 'ND-IB Live Vaccine (LaSota strain)', dosage: '1 drop per eye, or per label in drinking water', route: 'Eye drop / In-water',
  },
  {
    day_start: 10, day_end: 14,
    action: 'Infectious Bursal Disease (Gumboro) vaccination',
    purpose: 'Protect against Gumboro (IBD), which suppresses immunity if missed',
    medication: 'IBD (Gumboro) Live Vaccine', dosage: 'Per label, in drinking water', route: 'In-water',
  },
  {
    day_start: 14, day_end: 18,
    action: 'Deworming',
    purpose: 'Remove intestinal worms that slow growth (mainly for floor/free-range rearing)',
    medication: 'Broad-spectrum poultry dewormer', dosage: 'Per label, in drinking water or feed', route: 'Oral / In-feed',
    conditional: 'Skip if raised entirely on wire/slatted flooring with no litter contact.',
  },
  {
    day_start: 18, day_end: 21,
    action: 'Newcastle Disease booster',
    purpose: 'Reinforce ND immunity heading into the grower stage',
    medication: 'ND Live Vaccine (LaSota strain)', dosage: 'Per label, in drinking water', route: 'In-water',
  },
  {
    day_start: 21, day_end: 24,
    action: 'Gumboro booster (2nd dose)',
    purpose: 'Extend IBD protection for longer grow-out cycles',
    medication: 'IBD (Gumboro) Live Vaccine', dosage: 'Per label, in drinking water', route: 'In-water',
    conditional: 'Mainly needed if targeting 45+ day harvest; skip for fast-cycle 30-35 day flocks.',
  },
  {
    day_start: 25, day_end: 30,
    action: 'Vitamin + electrolyte pulse',
    purpose: 'Counter heat stress as birds grow and stocking density rises',
    medication: 'Electrolyte + Vitamin premix', dosage: 'Per label, in drinking water', route: 'In-water',
  },
  {
    day_start: 32, day_end: 38,
    action: 'Leg health & density check',
    purpose: 'Catch ascites/leg weakness early; overcrowding worsens both',
    medication: null, dosage: null, route: null,
    tasks: 'Watch for lameness or labored breathing; thin out stocking density if birds look crowded.',
  },
  {
    day_start: 38, day_end: 42,
    action: 'Begin feed/medication withdrawal',
    purpose: 'Ensure no medicated feed or drugs remain in the system at harvest',
    medication: null, dosage: null, route: null,
    tasks: 'Switch to plain withdrawal feed; stop all medicated water additives per label withdrawal period.',
  },
];

export type ChickenCareRecommendation = PigCareRecommendation & { dailyAmount: string };

// ─── Compute recommendation (zero API cost) ───────────────────────────────────

const CURRENT_WINDOW = 3;  // ±3 days = "due now"
const UPCOMING_DAYS  = 7;  // look 7 days ahead
const PAST_DAYS      = 4;  // warn about items missed in last 4 days

export function computeChickenCareRecommendation(ageDays: number): ChickenCareRecommendation {
  const age = Math.max(0, Math.floor(ageDays));

  const feedStage =
    CHICKEN_FEEDING_STAGES.find(s => age >= s.days_start && age <= s.days_end) ??
    CHICKEN_FEEDING_STAGES[CHICKEN_FEEDING_STAGES.length - 1];

  const dueNow: CareScheduleItem[]          = [];
  const upcoming: CareScheduleItem[]        = [];
  const recentlyOverdue: CareScheduleItem[] = [];

  for (const item of CHICKEN_CARE_SCHEDULE) {
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

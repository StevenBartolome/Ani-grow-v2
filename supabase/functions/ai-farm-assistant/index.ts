// Supabase Edge Function — ai-farm-assistant (AniBot with full Tool Use)
// Deploy: npx supabase functions deploy ai-farm-assistant --project-ref <ref>
// Secrets needed: ANTHROPIC_API_KEY
// Built-in: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── System prompts ───────────────────────────────────────────────────────────

const ANIBOT_SYSTEM = `You are AniBot, the intelligent AI assistant built into AniGrow — a smart livestock farm management platform. You have full access to the farm database via tools and can do everything a farmer can do in the app:

  READ:
  • Farm overview, housings, devices
  • Animal batches with mortality stats
  • Health records (vaccinations, treatments, illness, deworming, vitamins, mortality)
  • Weight logs from AniWeigh scales
  • Feed dispense logs from AniFeed devices
  • Available feed inventory

  WRITE (take action when the farmer asks):
  • Register new batch of animals into a housing
  • Add heads to an existing batch
  • Record deceased animals (with cause)
  • Update batch status (complete / archive)
  • Add health records
  • Create new housing
  • Update housing (rename, change capacity)
  • Delete housing
  • Create new feed type
  • Update feed info

  Rules:
  - Always call get_farm_overview first when you need IDs (housing, device, batch) before performing write actions.
  - Never guess IDs — always fetch them via tools.
  - After every write action, clearly confirm: "✅ Done — [what you did]".
  - If the user gives you all the details needed, proceed directly without asking again.
  - Be concise, friendly, and specific. Use metric units (kg, grams). Note that raw weight values in database logs (like net_weight_grams) are in grams, so you must divide by 1000 to get kg (e.g. 850 grams = 0.85 kg). Double-check your math and decimal points carefully so that a 0.85 kg weight is never written as 85 kg.
  - For destructive actions (delete housing), warn the user and confirm intent before proceeding.

  OUT-OF-SCOPE GUARDRAIL — CRITICAL:
  - You are strictly an AI assistant specialized in livestock farm management, animal health & nutrition (pigs, chickens, swine, poultry), farm equipment/devices (AniWeigh, AniFeed), and AniGrow platform features.
  - If the user asks a question or makes a request completely outside this scope (e.g. general coding/programming, sports, movies, celebrity news, general world history/geography, non-farm recipes, video games, politics, financial markets, personal advice, etc.), you MUST decline to answer.
  - When declining, respond politely with a message such as:
    "I am AniBot, an AI assistant dedicated specifically to livestock farming and AniGrow app operations. I can only help with farm management, animal health & nutrition, weight/feed logs, and AniGrow app features. How can I assist you with your farm today?"
  - Do NOT call any tools or attempt to answer off-topic questions.

  VALIDATION — CRITICAL:
  - When a tool returns { validation_error: true }, STOP. Do NOT proceed with the action.
  - Explain the conflict clearly to the user (e.g. "That housing only has space for X more animals but you're adding Y").
  - Always present options and ask the user to choose. For example:
    "⚠️ Pig Pen C has a capacity of 80 but already has 10 animals — only 70 spots remain, and you're trying to add 90.
    What would you like to do?
    1. Increase the housing capacity to fit 90 more (new total capacity: 100)
    2. Adjust the batch count to 70 (maximum available space)
    3. Cancel"
  - Wait for the user's choice before taking any further action.
  - Never register, add, or update anything that would exceed a housing's capacity without explicit user approval.

  Navigation hints — append up to 2 nav tags at the very end of your response (after the last sentence, nothing after the tags):
  [NAV:animals] — Animals list
  [NAV:animal_details:housingId=ID] — Specific animal housing
  [NAV:health_records:housingId=ID&batchId=ID] — Health records for a batch
  [NAV:health_records:housingId=ID] — Health records for a housing
  [NAV:weight_scale:deviceId=ID] — AniWeigh device screen
  [NAV:feed_device:deviceId=ID] — AniFeed device screen
  [NAV:weight_logs] — All weight logs
  [NAV:feed_records] — All feed records
  [NAV:devices] — Devices list
  [NAV:home] — Home dashboard
  [NAV:notifications] — Notifications

  Only append tags relevant to the response. Substitute real IDs from tool results — never write "ID" literally. Skip tags for general chat.

  PIG CARE GUIDE — Age-Based Recommendations:
  - Use get_pig_care_recommendations whenever a farmer asks about pig feeding, feed amount, supplements, medications, vitamins, dewormers, or vaccination schedule.
  - First call get_animals to get the batch's arrival_date and age_at_arrival_days.
  - Compute current age in days: age_at_arrival_days + Math.floor((Date.now() - new Date(arrival_date).getTime()) / 86400000)
  - Then call get_pig_care_recommendations with the computed age_days.
  - When presenting results: always show the current feed product + daily amount per pig, then list current/upcoming care actions (medication name, dosage, route, and purpose).
  - If the farmer asks about a specific pen or batch, compute the exact age from that batch's data.`;

const INSIGHT_SYSTEM = `You are FarmAI, an intelligent agricultural assistant for AniGrow.

  Format your response in this EXACT structure — no deviations:

  HEADLINE: [5-8 word summary of the current situation]
  1. [First actionable recommendation — specific to the data, 1-2 sentences]
  2. [Second actionable recommendation if applicable — 1-2 sentences]
  3. [Third actionable recommendation if applicable — 1-2 sentences]

  Rules:
  - Always start with "HEADLINE:" on its own line
  - Use numbered items (1., 2., 3.) for recommendations.
  - You do not need to provide multiple numbered items if the advice is simple or short; providing just one recommendation is perfectly fine.
  - Maximum 3 items
  - Use metric units (kg, grams). Note that raw weight values in database logs (like net_weight_grams) are in grams, so you must divide by 1000 to get kg (e.g. 850 grams = 0.85 kg). Double-check your math and decimal points carefully so that a 0.85 kg weight is never written as 85 kg.
  - Ground every point in the exact numbers provided — no generic advice
  - No markdown headers, no extra text, no asterisks, no dashes
  - Be direct and actionable`;

// ─── Pig Care Guide Data ──────────────────────────────────────────────────────

const PIG_FEEDING_STAGES = [
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

// Special sow/breeder feeding guide (by pregnancy/lactation stage)
const SOW_FEEDING_GUIDE = [
  { stage: 'Flushing (pre-breeding)', product: 'Mama PRO Premium Developer', amount_per_day: '3.0–3.5 kg' },
  { stage: 'Pregnancy Day 1–7', product: 'Mama PRO Premium Developer', amount_per_day: '2.0 kg' },
  { stage: 'Pregnancy Day 8–90', product: 'Mama PRO Premium Developer', amount_per_day: '2.0–2.8 kg (feed to condition)' },
  { stage: 'Pregnancy Day 91–100', product: 'Mama PRO Premium Developer', amount_per_day: '3.0 kg' },
  { stage: 'Pregnancy Day 101–110', product: 'Mama PRO Premium Milkmaker', amount_per_day: '3.0 kg' },
  { stage: '3 days before farrowing', product: 'Mama PRO Premium Milkmaker', amount_per_day: 'Gradually reduce to 0–0.5 kg on farrowing day' },
  { stage: 'Lactation Day 1–3', product: 'Mama PRO Premium Milkmaker', amount_per_day: 'Start at 1 kg on day 1, gradually increase' },
  { stage: 'Lactation Day 4 until weaning', product: 'Mama PRO Premium Milkmaker', amount_per_day: 'Ad libitum (unlimited)' },
];

const PIG_CARE_SCHEDULE = [
  // ── Piglet (Days 1–33) ──────────────────────────────────────────────────────
  {
    day_start: 1, day_end: 3,
    action: 'Newborn care tasks',
    purpose: 'Basic care and hygiene',
    medication: null,
    dosage: null,
    route: null,
    tasks: 'Clean piglet, ensure colostrum intake, clip needle teeth, cut navel cord, dock tail',
  },
  {
    day_start: 1, day_end: 3,
    action: 'Diarrhea prevention',
    purpose: 'Prevent scours/diarrhea in newborns',
    medication: 'APRALYTE',
    dosage: 'Mix 2 tbsp in 40 mL water; give 1 mL per piglet (or 1 mL/kg body weight if severe)',
    route: 'Oral (drench)',
  },
  {
    day_start: 3, day_end: 3,
    action: 'Iron injection',
    purpose: 'Prevent anemia and stunting; boost immunity',
    medication: 'JECTRAN PREMIUM with ZINC',
    dosage: '1 mL per piglet',
    route: 'IM Injection',
  },
  {
    day_start: 10, day_end: 10,
    action: 'Growth boost injection',
    purpose: 'Stimulate faster growth',
    medication: 'BEXAN SP',
    dosage: '1 mL per piglet',
    route: 'IM Injection',
  },
  {
    day_start: 10, day_end: 14,
    action: 'Disease prevention + castration of boar piglets',
    purpose: 'Strengthen immunity and prevent illness',
    medication: 'VETRACIN PREMIUM',
    dosage: '2 tsp per gallon of drinking water',
    route: 'In-water medication',
  },
  {
    day_start: 14, day_end: 14,
    action: 'Iron booster shot',
    purpose: 'Prevent anemia; strengthen immunity',
    medication: 'JECTRAN PREMIUM with ZINC',
    dosage: '1 mL per piglet',
    route: 'IM Injection',
  },
  {
    day_start: 21, day_end: 21,
    action: 'Hog Cholera vaccination',
    purpose: 'Protection against Hog Cholera (Classical Swine Fever)',
    medication: 'COGLAPEST',
    dosage: '2 mL per piglet',
    route: 'Injection',
  },
  {
    day_start: 23, day_end: 33,
    action: 'Pre-weaning stress reduction',
    purpose: 'Reduce weaning stress with probiotics, acidifiers, electrolytes, and enzymes',
    medication: 'DIGESTIAIDE 4X',
    dosage: '2 tsp per gallon of drinking water',
    route: 'In-water medication',
  },
  {
    day_start: 25, day_end: 25,
    action: 'Pre-weaning growth booster',
    purpose: 'Prepare piglets for weaning',
    medication: 'BEXAN SP',
    dosage: '1 mL per piglet',
    route: 'IM Injection',
  },
  // ── Growing Pig (Days 35–120) ─────────────────────────────────────────────
  {
    day_start: 35, day_end: 35,
    action: 'Deworming',
    purpose: 'Remove intestinal worms that slow growth',
    medication: 'LATIGO-1000',
    dosage: '1 sachet per 10 piglets; mix in water or feed',
    route: 'Oral / In-feed',
  },
  {
    day_start: 36, day_end: 42,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD',
    dosage: '2 tsp per gallon of drinking water',
    route: 'In-water medication',
  },
  {
    day_start: 42, day_end: 42,
    action: 'Hog Cholera booster vaccination',
    purpose: 'Booster shot for Hog Cholera',
    medication: 'COGLAPEST',
    dosage: '2 mL per head',
    route: 'Injection',
  },
  {
    day_start: 42, day_end: 42,
    action: 'Diarrhea treatment',
    purpose: 'Treatment for severe diarrhea',
    medication: 'BACTERID',
    dosage: '1 mL per 20 kg body weight',
    route: 'Injection',
    conditional: 'Only if symptoms of severe diarrhea are present',
  },
  {
    day_start: 60, day_end: 60,
    action: 'Growth boost injection',
    purpose: 'Stimulate fast growth',
    medication: 'BEXAN SP',
    dosage: '3 mL per head',
    route: 'IM Injection',
  },
  {
    day_start: 60, day_end: 60,
    action: 'Pneumonia treatment',
    purpose: 'Treatment for severe pneumonia',
    medication: 'SUSTALIN LA',
    dosage: '1 mL per 10 kg body weight',
    route: 'Injection',
    conditional: 'Only if symptoms of severe pneumonia are present',
  },
  {
    day_start: 66, day_end: 72,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD',
    dosage: '2 tsp per gallon of drinking water',
    route: 'In-water medication',
  },
  {
    day_start: 66, day_end: 72,
    action: 'Deworming',
    purpose: 'Remove worms that slow growth',
    medication: 'LATIGO-1000',
    dosage: '1 sachet per 3 growers; mix in water or feed',
    route: 'Oral / In-feed',
  },
  {
    day_start: 96, day_end: 102,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD',
    dosage: '2 tsp per gallon of drinking water',
    route: 'In-water medication',
  },
  {
    day_start: 115, day_end: 120,
    action: 'Pneumonia prevention — pulse medication',
    purpose: 'Prevent pneumonia outbreak',
    medication: 'VETRACIN GOLD',
    dosage: '2 tsp per gallon of drinking water',
    route: 'In-water medication',
  },
];

// Anytime (use if serious infection/complications arise)
const PIG_ANYTIME_CARE = [
  {
    action: 'Severe infection or pneumonia complications',
    medication: 'VETRACIN ULTIMA',
    dosage: '1 sachet per 1 gallon of drinking water; administer for 5–7 days',
    route: 'In-water medication',
    note: 'Use when there are serious bacterial infections or pneumonia complications in any stage.',
  },
];

// ─── Tool definitions ─────────────────────────────────────────────────────────

const FARM_ID_PARAM = {
  farm_id: { type: 'string', description: 'Optional: target a specific farm by ID (multi-farm admins only). Omit to use the primary active farm.' },
};

const TOOLS = [
  // ── Read tools ──────────────────────────────────────────────────────────────
  {
    name: 'get_farm_overview',
    description: 'Get farm name, all housings (id, name, animal_type, current_count, capacity, status), and all devices (id, name, type, status). Call this first before any write action that needs IDs. Multi-farm admins: pass farm_id to query a specific farm.',
    input_schema: { type: 'object', properties: { ...FARM_ID_PARAM }, required: [] },
  },
  {
    name: 'get_animals',
    description: 'Get all animal batches with housing info, counts, mortality stats, arrival date, supplier. Multi-farm admins: pass farm_id to query a specific farm.',
    input_schema: {
      type: 'object',
      properties: {
        housing_id: { type: 'string', description: 'Optional: filter by housing ID' },
        ...FARM_ID_PARAM,
      },
    },
  },
  {
    name: 'get_health_records',
    description: 'Get health records (vaccination, treatment, illness, observation, deworming, vitamins, mortality). Multi-farm admins: pass farm_id to query a specific farm.',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Optional: filter by batch ID' },
        record_type: { type: 'string', description: 'Optional: filter by type' },
        limit: { type: 'number', description: 'Max records (default 15)' },
        ...FARM_ID_PARAM,
      },
    },
  },
  {
    name: 'get_mortality_records',
    description: 'Get all deceased/mortality events with cause of death, count, date. Also returns per-batch mortality summary. Multi-farm admins: pass farm_id to query a specific farm.',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Optional: filter by batch ID' },
        limit: { type: 'number', description: 'Max records (default 20)' },
        ...FARM_ID_PARAM,
      },
    },
  },
  {
    name: 'get_weight_logs',
    description: 'Get recent weight measurements from AniWeigh scales. The returned log records contain weights in grams under the net_weight_grams field (e.g. 850 means 850 grams or 0.85 kg). You must divide by 1000 to report/analyze weights in kg. Multi-farm admins: pass farm_id to query a specific farm.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max records (default 10)' },
        ...FARM_ID_PARAM,
      },
    },
  },
  {
    name: 'get_feed_logs',
    description: 'Get recent feed dispense logs from AniFeed devices. Multi-farm admins: pass farm_id to query a specific farm.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max records (default 10)' },
        ...FARM_ID_PARAM,
      },
    },
  },
  {
    name: 'get_feeds',
    description: 'Get available feed types/inventory registered on the farm (name, brand, category, animal_type, stock_kg, supplier). Multi-farm admins: pass farm_id to query a specific farm.',
    input_schema: { type: 'object', properties: { ...FARM_ID_PARAM }, required: [] },
  },

  // ── Animal / batch write tools ───────────────────────────────────────────────
  {
    name: 'register_batch',
    description: 'Register a new batch of animals in a housing. Call get_farm_overview first to get the correct housing_id.',
    input_schema: {
      type: 'object',
      properties: {
        housing_id: { type: 'string', description: 'Housing ID where animals will be placed' },
        name: { type: 'string', description: 'Batch name e.g. "Batch May 2025"' },
        initial_count: { type: 'number', description: 'Number of animals' },
        animal_type: { type: 'string', description: '"chicken" or "pig"' },
        supplier: { type: 'string', description: 'Optional: supplier/source' },
        arrival_date: { type: 'string', description: 'Optional: YYYY-MM-DD (default today)' },
        age_at_arrival_days: { type: 'number', description: 'Optional: age of the animals at arrival in days (default 0)' },
      },
      required: ['housing_id', 'name', 'initial_count', 'animal_type'],
    },
  },
  {
    name: 'add_heads_to_batch',
    description: 'Add more animals to an existing batch (e.g. restocking). Updates both batch and housing counts.',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Batch ID to add animals to' },
        count: { type: 'number', description: 'Number of animals to add' },
      },
      required: ['batch_id', 'count'],
    },
  },
  {
    name: 'record_deceased',
    description: 'Record deceased/dead animals for a batch. Decrements batch count and saves a mortality health record.',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Batch ID' },
        count: { type: 'number', description: 'Number of animals that died' },
        cause: { type: 'string', description: 'Cause of death: Illness | Injury | Predator | Unknown | Other' },
        notes: { type: 'string', description: 'Optional: additional details' },
      },
      required: ['batch_id', 'count', 'cause'],
    },
  },
  {
    name: 'update_batch_status',
    description: 'Change batch status to "completed" or "archived". Use when a batch cycle ends.',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Batch ID' },
        status: { type: 'string', description: '"completed" or "archived"' },
      },
      required: ['batch_id', 'status'],
    },
  },
  {
    name: 'add_health_record',
    description: 'Add a health record (vaccination, treatment, illness, observation, deworming, vitamins) for a batch.',
    input_schema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Batch ID' },
        record_type: { type: 'string', description: 'vaccination | treatment | illness | observation | deworming | vitamins' },
        title: { type: 'string', description: 'Short title e.g. "Newcastle Disease Vaccine"' },
        notes: { type: 'string', description: 'Detailed notes' },
        severity: { type: 'string', description: 'low | medium | high (default: low)' },
        medication: { type: 'string', description: 'Optional: medication/vaccine name' },
        dosage: { type: 'string', description: 'Optional: dosage info' },
        affected_count: { type: 'number', description: 'Optional: animals affected' },
        record_date: { type: 'string', description: 'Optional: YYYY-MM-DD (default today)' },
      },
      required: ['batch_id', 'record_type', 'title', 'notes'],
    },
  },

  // ── Housing write tools ──────────────────────────────────────────────────────
  {
    name: 'create_housing',
    description: 'Create a new housing/pen on the farm.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Housing name e.g. "Chicken House C" or "Pig Pen 3"' },
        animal_type: { type: 'string', description: '"chicken" or "pig"' },
        capacity: { type: 'number', description: 'Maximum animal capacity' },
      },
      required: ['name', 'animal_type', 'capacity'],
    },
  },
  {
    name: 'update_housing',
    description: 'Rename a housing or change its capacity.',
    input_schema: {
      type: 'object',
      properties: {
        housing_id: { type: 'string', description: 'Housing ID to update' },
        name: { type: 'string', description: 'Optional: new name' },
        capacity: { type: 'number', description: 'Optional: new capacity' },
      },
      required: ['housing_id'],
    },
  },
  {
    name: 'delete_housing',
    description: 'Delete a housing. WARNING: this also removes all related batches. Only call after user explicitly confirms deletion.',
    input_schema: {
      type: 'object',
      properties: {
        housing_id: { type: 'string', description: 'Housing ID to delete' },
      },
      required: ['housing_id'],
    },
  },

  // ── Feed write tools ─────────────────────────────────────────────────────────
  {
    name: 'create_feed',
    description: 'Create a new feed type/product in the farm inventory.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Feed product name' },
        animal_type: { type: 'string', description: '"chicken" or "pig"' },
        brand: { type: 'string', description: 'Optional: brand name' },
        category: { type: 'string', description: 'Optional: category e.g. "Starter", "Grower", "Finisher"' },
        supplier: { type: 'string', description: 'Optional: supplier name' },
        initial_stock_kg: { type: 'number', description: 'Optional: initial stock in kg (default 0)' },
      },
      required: ['name', 'animal_type'],
    },
  },
  {
    name: 'update_feed',
    description: 'Update a feed type info (name, brand, category, supplier, stock).',
    input_schema: {
      type: 'object',
      properties: {
        feed_id: { type: 'string', description: 'Feed ID to update' },
        name: { type: 'string', description: 'Optional: new name' },
        brand: { type: 'string', description: 'Optional: new brand' },
        category: { type: 'string', description: 'Optional: new category' },
        supplier: { type: 'string', description: 'Optional: new supplier' },
        stock_kg: { type: 'number', description: 'Optional: updated stock in kg' },
      },
      required: ['feed_id'],
    },
  },

  // ── Pig Care Guide tool ──────────────────────────────────────────────────────
  {
    name: 'get_pig_care_recommendations',
    description: 'Get age-based pig care recommendations: correct feed product and daily amount per pig, scheduled medications, vaccines, supplements, dewormers, and dosages. Use whenever a farmer asks what to feed their pigs, what supplements or medications to give, or what the care schedule is for a pig batch. First call get_animals to get arrival_date and age_at_arrival_days, compute age_days = age_at_arrival_days + floor((Date.now() - new Date(arrival_date).getTime()) / 86400000), then call this tool.',
    input_schema: {
      type: 'object',
      properties: {
        age_days: {
          type: 'number',
          description: 'Current age of the pig(s) in days. Compute as: age_at_arrival_days + Math.floor((Date.now() - new Date(arrival_date).getTime()) / 86400000)',
        },
      },
      required: ['age_days'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(db: any, farmId: string, userId: string, name: string, input: any, allowedFarmIds?: string[]): Promise<any> {
  // READ tools support an optional farm_id override for multi-farm admins
  const READ_TOOLS = ['get_farm_overview', 'get_animals', 'get_health_records', 'get_mortality_records', 'get_weight_logs', 'get_feed_logs', 'get_feeds'];
  const effectiveFarmId = (
    input.farm_id &&
    READ_TOOLS.includes(name) &&
    (allowedFarmIds ?? [farmId]).includes(input.farm_id)
  ) ? input.farm_id : farmId;
  const today = new Date().toISOString().split('T')[0];

  try {
    switch (name) {

      // ── Read ────────────────────────────────────────────────────────────────

      case 'get_farm_overview': {
        const [farmRes, housingRes, deviceRes] = await Promise.all([
          db.from('farms').select('name').eq('id', effectiveFarmId).single(),
          db.from('housings').select('id, name, animal_type, current_count, capacity, status').eq('farm_id', effectiveFarmId).order('name'),
          db.from('devices').select('id, name, type, status').eq('farm_id', effectiveFarmId),
        ]);
        return { farm_id: effectiveFarmId, farm: farmRes.data, housings: housingRes.data ?? [], devices: deviceRes.data ?? [] };
      }

      case 'get_animals': {
        const { data: housings } = await db.from('housings').select('id').eq('farm_id', effectiveFarmId);
        const housingIds = (housings ?? []).map((h: any) => h.id);
        if (housingIds.length === 0) return { farm_id: effectiveFarmId, batches: [] };

        let query = db
          .from('batches')
          .select('id, name, animal_type, estimated_count, current_count, sold_count, arrival_date, age_at_arrival_days, supplier, status, housing_id, housings(id, name)')
          .order('created_at', { ascending: false });

        if (input.housing_id) {
          if (!housingIds.includes(input.housing_id)) return { farm_id: effectiveFarmId, batches: [] };
          query = query.eq('housing_id', input.housing_id);
        } else {
          query = query.in('housing_id', housingIds);
        }

        const { data } = await query;
        return {
          farm_id: effectiveFarmId,
          batches: (data ?? []).map((b: any) => ({
            ...b,
            sold_count: b.sold_count ?? 0,
            total_deceased: Math.max(0, (b.estimated_count ?? 0) - (b.current_count ?? 0) - (b.sold_count ?? 0)),
            mortality_rate_pct: b.estimated_count > 0
              ? (((Math.max(0, b.estimated_count - b.current_count - (b.sold_count ?? 0))) / b.estimated_count) * 100).toFixed(1) + '%'
              : '0.0%',
          })),
        };
      }

      case 'get_health_records': {
        const { data: housings } = await db.from('housings').select('id').eq('farm_id', effectiveFarmId);
        const housingIds = (housings ?? []).map((h: any) => h.id);
        const { data: farmBatches } = await db.from('batches').select('id').in('housing_id', housingIds);
        const batchIds = (farmBatches ?? []).map((b: any) => b.id);
        if (batchIds.length === 0) return { farm_id: effectiveFarmId, records: [] };

        let query = db
          .from('health_records')
          .select('id, record_type, title, notes, severity, record_date, medication, dosage, affected_count, followup_date, batch_id, batches(name, housings(name))')
          .is('deleted_at', null)
          .order('record_date', { ascending: false })
          .limit(input.limit ?? 15);

        if (input.batch_id) {
          if (!batchIds.includes(input.batch_id)) return { farm_id: effectiveFarmId, records: [] };
          query = query.eq('batch_id', input.batch_id);
        } else {
          query = query.in('batch_id', batchIds);
        }
        if (input.record_type) query = query.eq('record_type', input.record_type);

        const { data } = await query;
        return { farm_id: effectiveFarmId, records: data ?? [] };
      }

      case 'get_mortality_records': {
        const { data: housings } = await db.from('housings').select('id').eq('farm_id', effectiveFarmId);
        const housingIds = (housings ?? []).map((h: any) => h.id);
        const { data: farmBatches } = await db
          .from('batches').select('id, name, estimated_count, current_count, housings(name)').in('housing_id', housingIds);
        const batchIds = (farmBatches ?? []).map((b: any) => b.id);

        let query = db
          .from('health_records')
          .select('id, title, notes, severity, record_date, affected_count, batch_id, batches(name, estimated_count, current_count, housings(name))')
          .eq('record_type', 'mortality')
          .is('deleted_at', null)
          .order('record_date', { ascending: false })
          .limit(input.limit ?? 20);

        if (input.batch_id) {
          if (!batchIds.includes(input.batch_id)) {
            return { farm_id: effectiveFarmId, mortality_events: [], batch_mortality_summary: [] };
          }
          query = query.eq('batch_id', input.batch_id);
        } else {
          if (batchIds.length === 0) {
            return { farm_id: effectiveFarmId, mortality_events: [], batch_mortality_summary: [] };
          }
          query = query.in('batch_id', batchIds);
        }

        const { data: mortalityEvents } = await query;

        const batchSummary = (farmBatches ?? []).map((b: any) => ({
          batch_id: b.id,
          batch_name: b.name,
          housing_name: (b.housings as any)?.name,
          estimated_count: b.estimated_count,
          current_count: b.current_count,
          sold_count: b.sold_count ?? 0,
          total_deceased: Math.max(0, (b.estimated_count ?? 0) - (b.current_count ?? 0) - (b.sold_count ?? 0)),
          mortality_rate_pct: b.estimated_count > 0
            ? (((Math.max(0, b.estimated_count - b.current_count - (b.sold_count ?? 0))) / b.estimated_count) * 100).toFixed(1) + '%'
            : '0.0%',
        }));

        return { farm_id: effectiveFarmId, mortality_events: mortalityEvents ?? [], batch_mortality_summary: batchSummary };
      }

      case 'get_weight_logs': {
        const { data: devices } = await db.from('devices').select('id, name').eq('farm_id', effectiveFarmId).in('type', ['aniweigh', 'scale']);
        const deviceIds = (devices ?? []).map((d: any) => d.id);
        if (deviceIds.length === 0) return { farm_id: effectiveFarmId, logs: [], message: 'No AniWeigh scales found.' };

        const { data } = await db
          .from('weigh_sessions')
          .select('id, net_weight_grams, status, created_at, device_id')
          .in('device_id', deviceIds)
          .order('created_at', { ascending: false })
          .limit(input.limit ?? 10);

        const devMap = Object.fromEntries((devices ?? []).map((d: any) => [d.id, d.name]));
        return { farm_id: effectiveFarmId, logs: (data ?? []).map((r: any) => ({ ...r, device_name: devMap[r.device_id] })) };
      }

      case 'get_feed_logs': {
        const { data: devices } = await db.from('devices').select('id, name').eq('farm_id', effectiveFarmId).in('type', ['anifeed', 'feeder']);
        const deviceIds = (devices ?? []).map((d: any) => d.id);
        if (deviceIds.length === 0) return { farm_id: effectiveFarmId, logs: [], message: 'No AniFeed devices found.' };

        const { data } = await db
          .from('dispense_records')
          .select('id, grams_dispensed, status, dispensed_at, device_id')
          .in('device_id', deviceIds)
          .order('dispensed_at', { ascending: false })
          .limit(input.limit ?? 10);

        const devMap = Object.fromEntries((devices ?? []).map((d: any) => [d.id, d.name]));
        return { farm_id: effectiveFarmId, logs: (data ?? []).map((r: any) => ({ ...r, device_name: devMap[r.device_id] })) };
      }

      case 'get_feeds': {
        const { data, error } = await db
          .from('feeds')
          .select('id, name, brand, category, animal_type, stock_kg, supplier')
          .eq('farm_id', effectiveFarmId)
          .order('name');
        if (error) return { error: error.message };
        return { farm_id: effectiveFarmId, feeds: data ?? [] };
      }

      // ── Animal / batch write ─────────────────────────────────────────────────

      case 'register_batch': {
        // ── Capacity validation ──────────────────────────────────────────────
        const { data: housing, error: hErr } = await db
          .from('housings')
          .select('id, name, capacity, current_count')
          .eq('id', input.housing_id)
          .single();

        if (hErr || !housing) return { success: false, error: 'Housing not found.' };

        const availableSpace = (housing.capacity ?? 0) - (housing.current_count ?? 0);
        if (input.initial_count > availableSpace) {
          return {
            success: false,
            validation_error: true,
            housing_name: housing.name,
            housing_capacity: housing.capacity,
            housing_current_count: housing.current_count,
            available_space: availableSpace,
            requested_count: input.initial_count,
            message: `Capacity exceeded: "${housing.name}" has capacity ${housing.capacity}, currently holds ${housing.current_count} animals, leaving only ${availableSpace} available space. You tried to add ${input.initial_count}.`,
          };
        }
        // ── Insert ────────────────────────────────────────────────────────────
        const { data, error } = await db
          .from('batches')
          .insert({
            farm_id: farmId,
            housing_id: input.housing_id,
            name: input.name,
            animal_type: input.animal_type,
            estimated_count: input.initial_count,
            current_count: input.initial_count,
            supplier: input.supplier ?? null,
            arrival_date: input.arrival_date ?? today,
            age_at_arrival_days: input.age_at_arrival_days ?? 0,
            status: 'active',
            created_by: userId || null,
          })
          .select()
          .single();

        if (error) return { success: false, error: error.message };

        // Sync housing count
        const { data: activeBatches } = await db
          .from('batches').select('current_count').eq('housing_id', input.housing_id).eq('status', 'active');
        const newCount = (activeBatches ?? []).reduce((s: number, b: any) => s + (b.current_count ?? 0), 0);
        await db.from('housings').update({ current_count: newCount, updated_at: new Date().toISOString() }).eq('id', input.housing_id);

        return {
          success: true,
          batch: data,
          message: `Registered ${input.initial_count} ${input.animal_type}(s) as "${input.name}"`,
        };
      }

      case 'add_heads_to_batch': {
        // Fetch batch + housing
        const { data: batch, error: bFetchErr } = await db
          .from('batches')
          .select('id, current_count, estimated_count, housing_id, housings(id, name, current_count, capacity)')
          .eq('id', input.batch_id)
          .single();
        if (bFetchErr || !batch) return { success: false, error: 'Batch not found' };

        const housing = batch.housings as any;
        const housingCurrentCount = housing?.current_count ?? 0;
        const housingCapacity = housing?.capacity ?? 0;
        const availableSpace = housingCapacity - housingCurrentCount;

        // ── Capacity validation ──────────────────────────────────────────────
        if (input.count > availableSpace) {
          return {
            success: false,
            validation_error: true,
            housing_name: housing?.name,
            housing_capacity: housingCapacity,
            housing_current_count: housingCurrentCount,
            available_space: availableSpace,
            requested_count: input.count,
            message: `Capacity exceeded: "${housing?.name}" has capacity ${housingCapacity}, currently holds ${housingCurrentCount} animals, leaving only ${availableSpace} available space. You tried to add ${input.count}.`,
          };
        }

        const newBatchCount = (batch.current_count ?? 0) + input.count;
        const newEstimated = (batch.estimated_count ?? 0) + input.count;

        const { error } = await db.from('batches').update({
          current_count: newBatchCount,
          estimated_count: newEstimated,
          updated_at: new Date().toISOString(),
        }).eq('id', input.batch_id);
        if (error) return { success: false, error: error.message };

        await db.from('housings').update({
          current_count: housingCurrentCount + input.count,
          updated_at: new Date().toISOString(),
        }).eq('id', batch.housing_id);

        return { success: true, message: `Added ${input.count} animal(s) to the batch. New count: ${newBatchCount}` };
      }

      case 'record_deceased': {
        // Fetch batch + housing
        const { data: batch, error: bFetchErr } = await db
          .from('batches')
          .select('id, current_count, housing_id, housings(current_count, farm_id)')
          .eq('id', input.batch_id)
          .single();
        if (bFetchErr || !batch) return { success: false, error: 'Batch not found' };

        const n = input.count;
        const newBatchCount = Math.max(0, (batch.current_count ?? 0) - n);
        const housingCount = (batch.housings as any)?.current_count ?? 0;
        const newHousingCount = Math.max(0, housingCount - n);
        const fId = (batch.housings as any)?.farm_id ?? null;

        // Decrement counts
        const { error: bErr } = await db.from('batches').update({
          current_count: newBatchCount,
          updated_at: new Date().toISOString(),
        }).eq('id', input.batch_id);
        if (bErr) return { success: false, error: bErr.message };

        await db.from('housings').update({
          current_count: newHousingCount,
          updated_at: new Date().toISOString(),
        }).eq('id', batch.housing_id);

        // Save mortality health record
        const notes = input.notes
          ? `${n} animal(s) deceased. Cause: ${input.cause}. ${input.notes}`
          : `${n} animal(s) deceased. Cause: ${input.cause}.`;

        await db.from('health_records').insert({
          farm_id: fId,
          housing_id: batch.housing_id,
          batch_id: input.batch_id,
          record_type: 'mortality',
          title: `Mortality — ${input.cause}`,
          notes,
          severity: n >= 10 ? 'high' : n >= 3 ? 'medium' : 'low',
          affected_count: n,
          record_date: today,
          medication: null,
          dosage: null,
          followup_date: null,
        });

        return { success: true, message: `Recorded ${n} deceased animal(s). Cause: ${input.cause}. Batch count updated to ${newBatchCount}.` };
      }

      case 'update_batch_status': {
        const { error } = await db.from('batches').update({
          status: input.status,
          updated_at: new Date().toISOString(),
        }).eq('id', input.batch_id);
        if (error) return { success: false, error: error.message };
        return { success: true, message: `Batch status updated to "${input.status}"` };
      }

      case 'add_health_record': {
        // Retrieve batch and housing to get farm_id and housing_id
        const { data: batch } = await db
          .from('batches')
          .select('housing_id, housings(farm_id)')
          .eq('id', input.batch_id)
          .single();

        const hId = batch?.housing_id ?? null;
        const fId = (batch?.housings as any)?.farm_id ?? null;

        const { data, error } = await db.from('health_records').insert({
          farm_id: fId,
          housing_id: hId,
          batch_id: input.batch_id,
          record_type: input.record_type,
          title: input.title,
          notes: input.notes,
          severity: input.severity ?? 'low',
          medication: input.medication ?? null,
          dosage: input.dosage ?? null,
          affected_count: input.affected_count ?? null,
          record_date: input.record_date ?? today,
          followup_date: null,
        }).select().single();
        if (error) return { success: false, error: error.message };
        return { success: true, record: data, message: `Health record "${input.title}" added.` };
      }

      // ── Housing write ────────────────────────────────────────────────────────

      case 'create_housing': {
        const { data, error } = await db.from('housings').insert({
          farm_id: farmId,
          name: input.name,
          animal_type: input.animal_type,
          capacity: input.capacity,
          current_count: 0,
          status: 'Active',
          updated_at: new Date().toISOString(),
        }).select().single();
        if (error) return { success: false, error: error.message };
        return { success: true, housing: data, message: `Housing "${input.name}" created with capacity ${input.capacity}.` };
      }

      case 'update_housing': {
        const updates: any = { updated_at: new Date().toISOString() };
        if (input.name) updates.name = input.name;
        if (input.capacity) updates.capacity = input.capacity;

        const { error } = await db.from('housings').update(updates).eq('id', input.housing_id);
        if (error) return { success: false, error: error.message };
        return { success: true, message: `Housing updated successfully.` };
      }

      case 'delete_housing': {
        const { error } = await db.from('housings').delete().eq('id', input.housing_id);
        if (error) return { success: false, error: error.message };
        return { success: true, message: `Housing deleted.` };
      }

      // ── Feed write ───────────────────────────────────────────────────────────

      case 'create_feed': {
        const { data, error } = await db.from('feeds').insert({
          farm_id: farmId,
          name: input.name,
          animal_type: input.animal_type,
          brand: input.brand ?? null,
          category: input.category ?? null,
          supplier: input.supplier ?? null,
          stock_kg: input.initial_stock_kg ?? 0,
          updated_at: new Date().toISOString(),
        }).select().single();
        if (error) return { success: false, error: error.message };
        return { success: true, feed: data, message: `Feed "${input.name}" created.` };
      }

      case 'update_feed': {
        const updates: any = { updated_at: new Date().toISOString() };
        if (input.name !== undefined) updates.name = input.name;
        if (input.brand !== undefined) updates.brand = input.brand;
        if (input.category !== undefined) updates.category = input.category;
        if (input.supplier !== undefined) updates.supplier = input.supplier;
        if (input.stock_kg !== undefined) updates.stock_kg = input.stock_kg;

        const { error } = await db.from('feeds').update(updates).eq('id', input.feed_id);
        if (error) return { success: false, error: error.message };
        return { success: true, message: `Feed updated successfully.` };
      }

      // ── Pig Care Guide ────────────────────────────────────────────────────────
      case 'get_pig_care_recommendations': {
        const ageDays = Math.max(0, Math.floor(input.age_days ?? 0));

        // Find current feeding stage
        const feedStage =
          PIG_FEEDING_STAGES.find(s => ageDays >= s.days_start && ageDays <= s.days_end) ??
          PIG_FEEDING_STAGES[PIG_FEEDING_STAGES.length - 1]; // fallback to finisher

        // Determine pig stage label
        let pigStage = 'Unknown';
        if (ageDays <= 4) pigStage = 'Newborn';
        else if (ageDays <= 33) pigStage = 'Piglet';
        else if (ageDays <= 120) pigStage = 'Grower';
        else pigStage = 'Finisher / Market Hog';

        // Classify care schedule items relative to current age
        const CURRENT_WINDOW = 3;   // ±3 days = "do now"
        const UPCOMING_DAYS = 14;  // look 14 days ahead
        const PAST_DAYS = 7;   // warn about items missed in last 7 days

        const current_care: any[] = [];
        const upcoming_care: any[] = [];
        const overdue_care: any[] = [];

        for (const item of PIG_CARE_SCHEDULE) {
          const withinCurrent = item.day_end >= ageDays - CURRENT_WINDOW &&
            item.day_start <= ageDays + CURRENT_WINDOW;
          const withinUpcoming = item.day_start > ageDays + CURRENT_WINDOW &&
            item.day_start <= ageDays + UPCOMING_DAYS;
          const withinOverdue = item.day_end >= ageDays - PAST_DAYS &&
            item.day_end < ageDays - CURRENT_WINDOW;

          if (withinCurrent) current_care.push(item);
          else if (withinUpcoming) upcoming_care.push(item);
          else if (withinOverdue) overdue_care.push(item);
        }

        return {
          age_days: ageDays,
          pig_stage: pigStage,
          feed_recommendation: {
            stage: feedStage.stage,
            product: feedStage.product,
            daily_amount: feedStage.amount_per_day,
            notes: feedStage.notes,
          },
          sow_feeding_note: 'For sow/breeder feeding use Mama PRO Premium Developer (gestation) and Mama PRO Premium Milkmaker (lactation). Ask about sow care for detailed schedule.',
          current_care,
          upcoming_care,
          recently_overdue_care: overdue_care,
          anytime_care: PIG_ANYTIME_CARE,
          source: 'AniGrow Pig Care Guide — Pigrolac Premium Hog Feeds',
        };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return { error: err?.message ?? 'Tool execution failed' };
  }
}

// ─── Navigation tag parser ────────────────────────────────────────────────────

interface NavLink { label: string; route: string; icon: string; params?: Record<string, string>; }

const NAV_MAP: Record<string, { label: string; route: string; icon: string }> = {
  home: { label: 'Home Dashboard', route: '/(dashboard)/HomeScreen', icon: 'home' },
  animals: { label: 'Animals', route: '/(animals)/AnimalsScreen', icon: 'pets' },
  animal_details: { label: 'Animal Details', route: '/(animals)/AnimalDetails', icon: 'info' },
  health_records: { label: 'Health Records', route: '/(animals)/HealthRecordsScreen', icon: 'medical-services' },
  devices: { label: 'Devices', route: '/(devices)/DevicesScreen', icon: 'devices' },
  weight_scale: { label: 'AniWeigh Scale', route: '/(devices)/AniWeighScreen', icon: 'monitor-weight' },
  feed_device: { label: 'AniFeed Device', route: '/(devices)/AniFeedScreen', icon: 'grass' },
  weight_logs: { label: 'Weight Logs', route: '/(devices)/RecentLogsScreen', icon: 'monitor-weight' },
  feed_records: { label: 'Feed Records', route: '/(devices)/DispenseRecordsScreen', icon: 'grass' },
  notifications: { label: 'Notifications', route: '/(dashboard)/NotificationScreen', icon: 'notifications' },
};

function parseNavTags(text: string): { cleanText: string; navigation: NavLink[] } {
  const found: NavLink[] = [];
  const clean = text.replace(/\[NAV:([a-z_]+)(?::([^\]]*))?\]/g, (_match, key, paramStr) => {
    const base = NAV_MAP[key];
    if (!base) return '';
    const params: Record<string, string> = {};
    if (paramStr) {
      paramStr.split('&').forEach((pair: string) => {
        const [k, v] = pair.split('=');
        if (k && v) params[k.trim()] = v.trim();
      });
    }
    const sig = base.route + JSON.stringify(params);
    if (!found.find(n => n.route + JSON.stringify(n.params ?? {}) === sig)) {
      found.push({ ...base, params: Object.keys(params).length > 0 ? params : undefined });
    }
    return '';
  }).trim();
  return { cleanText: clean, navigation: found };
}

// ─── Anthropic caller ─────────────────────────────────────────────────────────

async function callClaude(apiKey: string, system: string, messages: any[], maxTokens: number, tools?: any[]) {
  const body: any = { model: 'claude-haiku-4-5', max_tokens: maxTokens, system, messages };
  if (tools) body.tools = tools;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`);
  return res.json();
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const db = createClient(supabaseUrl, serviceRoleKey);

    const { type, context, messages } = await req.json();
    const ctx = context ?? {};

    // ── Audio transcription via Groq Whisper ──────────────────────────────────
    if (type === 'transcribe') {
      const groqApiKey = Deno.env.get('GROQ_API_KEY');
      if (!groqApiKey) {
        // Graceful degradation — transcription unavailable but don't crash
        return new Response(JSON.stringify({ transcript: '', unavailable: true }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      const { audioData, mimeType = 'audio/webm' } = ctx;
      if (!audioData || audioData.length < 100) {
        return new Response(JSON.stringify({ transcript: '', unavailable: true }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
      try {
        const binaryStr = atob(audioData);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        const cleanMime = mimeType.split(';')[0].trim(); // strip codecs suffix
        const ext = cleanMime.split('/').pop() ?? 'webm';
        const formData = new FormData();
        formData.append('file', new Blob([bytes], { type: cleanMime }), `audio.${ext}`);
        formData.append('model', 'whisper-large-v3-turbo');
        // No 'language' param — auto-detect supports Tagalog, English, and Taglish
        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqApiKey}` },
          body: formData,
        });
        if (!groqRes.ok) {
          const errText = await groqRes.text();
          console.error('[AniBot] Groq error:', errText);
          return new Response(JSON.stringify({ transcript: '', unavailable: true }), {
            status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
          });
        }
        const { text } = await groqRes.json();
        return new Response(JSON.stringify({ transcript: text ?? '' }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      } catch (transcribeErr) {
        console.error('[AniBot] transcribe error:', transcribeErr);
        return new Response(JSON.stringify({ transcript: '', unavailable: true }), {
          status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Insight (no tool use) ─────────────────────────────────────────────────
    if (type === 'insight') {
      let system = INSIGHT_SYSTEM;
      if (ctx.type === 'weight') system += '\n\nFocus on weight segregation analysis and care recommendations.';
      if (ctx.type === 'feed') {
        system += `\n\nFocus on feed dispensing patterns and optimization recommendations.
  Specifically for the feed dispensing schedule:
  - Under data, you are provided with:
    * timesPerDay: the target number of scheduled dispenses per day.
    * gramsPerDispense: the target grams of feed per dispense.
    * todayTotalGrams: the total grams successfully dispensed today.
    * todayCompletedDispensesCount: the exact number of successful dispenses completed today.
  - A dispense schedule is fully completed for the day if todayCompletedDispensesCount >= timesPerDay.
  - Do NOT recommend dispensing more feed if todayCompletedDispensesCount >= timesPerDay. In this case, clearly state that the feeding schedule for today has been successfully completed.
  - Be extremely accurate with arithmetic and logic. Double-check your completed count against the target.`;
      }
      if (ctx.type === 'animal') system += '\n\nFocus on the animal\'s growth, health status, and recommended next actions.';
      if (ctx.type === 'health') system += '\n\nFocus on health record trends, risk assessment, and follow-up priorities.';

      const data = await callClaude(apiKey, system, [
        { role: 'user', content: `Farm data:\n${JSON.stringify(ctx, null, 2)}\n\nProvide a concise insight.` },
      ], 300);

      return new Response(JSON.stringify({ result: data?.content?.[0]?.text ?? '' }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── AniBot chat with agentic tool use ─────────────────────────────────────
    if (type === 'chat') {
      const farmId = ctx.farmId ?? ctx.farmIds?.[0];
      const farmIds: string[] = ctx.farmIds ?? (farmId ? [farmId] : []);
      const userId = ctx.userId ?? '';
      if (!farmId) throw new Error('farmId required for AniBot chat');

      let system = ANIBOT_SYSTEM;
      if (ctx.farmName) system += `\n\nActive farm: ${ctx.farmName}`;
      const managedFarms: { id: string; name: string }[] = ctx.managedFarms ?? [];
      if (farmIds.length > 1) {
        const farmList = farmIds.map((id: string) => {
          const name = managedFarms.find((f: any) => f.id === id)?.name ?? id;
          return `• "${name}" (farm_id: ${id})`;
        }).join('\n');
        system += `\n\n─── MULTI-FARM ADMIN ───
  You manage ${farmIds.length} farms. The user has selected "All Farms" mode so you can access all of them.

  Managed farms:
  ${farmList}

  Primary/active farm: "${ctx.farmName}" (farm_id: ${farmId})

  READ TOOL RULES:
  - All read tools (get_farm_overview, get_animals, get_health_records, get_mortality_records, get_weight_logs, get_feed_logs, get_feeds) accept an optional "farm_id" parameter.
  - To query a specific farm, pass its farm_id. To query the primary farm, omit farm_id.
  - For cross-farm reports (e.g. "give me a summary of all farms"), call each read tool once per farm, passing the correct farm_id each time, then synthesize the results.

  WRITE TOOL RULES:
  - Write tools always operate on the primary farm unless the user explicitly names another farm.
  - If the user says "add animals to Farm X", first call get_farm_overview with Farm X's farm_id to get its housing IDs, then use register_batch.`;
      }

      // Support image analysis — attach image to the last user message if present
      const imageData = ctx.imageData as string | undefined;
      const imageMediaType = (ctx.imageMediaType as string | undefined) ?? 'image/jpeg';

      const loopMessages: any[] = (messages ?? []).map((m: any, idx: number) => {
        if (m.role === 'user' && idx === (messages?.length ?? 0) - 1 && imageData) {
          return {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageData } },
              { type: 'text', text: m.content || 'Please analyze this image and provide insights relevant to my farm.' },
            ],
          };
        }
        return { role: m.role, content: m.content };
      });

      let finalText = 'I was unable to generate a response. Please try again.';

      for (let round = 0; round < 8; round++) {
        const data = await callClaude(apiKey, system, loopMessages, 1024, TOOLS);

        const toolBlocks = (data.content ?? []).filter((b: any) => b.type === 'tool_use');
        const textBlocks = (data.content ?? []).filter((b: any) => b.type === 'text');

        if (toolBlocks.length === 0) {
          finalText = textBlocks.map((b: any) => b.text).join('\n').trim();
          break;
        }

        const toolResults = await Promise.all(
          toolBlocks.map(async (toolUse: any) => {
            const result = await executeTool(db, farmId, userId, toolUse.name, toolUse.input ?? {}, farmIds);
            return { type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) };
          })
        );

        loopMessages.push({ role: 'assistant', content: data.content });
        loopMessages.push({ role: 'user', content: toolResults });
      }

      const { cleanText, navigation } = parseNavTags(finalText);

      return new Response(JSON.stringify({ result: cleanText, navigation }), {
        status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid type — must be "insight" or "chat"');

  } catch (err: any) {
    console.error('[ai-farm-assistant]', err);
    return new Response(
      JSON.stringify({ error: err?.message ?? 'Unknown error' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});

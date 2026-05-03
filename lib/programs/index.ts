// 8 curated meal-planning programs. Each maps to one of the source thread's
// 12 nutrition prompts (https://threadreaderapp.com/thread/2045826159636824423.html).
// "Activating" a program records it on the user's profile and feeds extra
// context into the Coach + insight prompts.

export interface Program {
  id: string;
  name: string;
  category: string;
  short: string;
  long: string;
  duration_days: number;
  hero_color: string; // CSS color
  features: string[];
  // System-prompt fragment merged into the Coach when this is active.
  coach_context: string;
}

export const PROGRAMS: Program[] = [
  {
    id: "sunday-prep",
    name: "Sunday Meal Prep",
    category: "system",
    short: "One 90-minute Sunday session covers 5 lunches and 3 dinners.",
    long: "A simultaneous-cooking protocol: oven, stovetop, and prep counter running in parallel. Hestia plans the timing so everything finishes within 90 minutes.",
    duration_days: 7,
    hero_color: "oklch(0.78 0.09 60)",
    features: [
      "Minute-by-minute Sunday timeline",
      "5 lunches + 3 dinners batch-cooked",
      "Storage + reheat instructions per dish",
      "Grocery list aligned to the week",
    ],
    coach_context:
      "User is following the Sunday Meal Prep program — bias suggestions toward batch-cookable, refrigerator-stable meals. Lean on shared base ingredients (e.g., grilled chicken into 3 bowls). Avoid daily cooking suggestions.",
  },
  {
    id: "16-8-fasting",
    name: "16:8 Intermittent Fasting",
    category: "protocol",
    short: "Compress eating into an 8-hour window. Preserve muscle, build the habit.",
    long: "Selects an eating window aligned with the user's training and work schedule. Manages hunger adaptation in week 1 and protein distribution to preserve lean mass.",
    duration_days: 30,
    hero_color: "oklch(0.74 0.10 30)",
    features: [
      "Personalized eating-window selection",
      "Week 1 hunger-adaptation protocol",
      "Protein-density bias for lean mass",
      "Pre/post-workout timing within window",
    ],
    coach_context:
      "User is on 16:8 IF — keep eating to a single 8-hour window. Suggest higher protein density per meal since meal count is reduced. Don't recommend snacks outside the window.",
  },
  {
    id: "habit-rewire",
    name: "Habit Rewire",
    category: "behavior",
    short: "Map your triggers, redesign your environment, build accountability.",
    long: "30 days of behavioural psychology — emotional eating triggers mapped, environment shifts identified, weekly accountability check-ins. Less restriction, more architecture.",
    duration_days: 30,
    hero_color: "oklch(0.78 0.07 280)",
    features: [
      "Trigger mapping interview",
      "Kitchen + pantry environment audit",
      "Weekly habit-loop check-ins",
      "Replacement behaviours catalog",
    ],
    coach_context:
      "User is in Habit Rewire — frame suggestions around psychology and environment design, not restriction. Ask what triggered cravings, suggest replacement behaviours and pantry tweaks. Avoid prescribing specific kcal counts unless asked.",
  },
  {
    id: "gut-repair",
    name: "Gut Repair (30-day)",
    category: "therapeutic",
    short: "Trigger elimination → fiber progression → probiotic integration.",
    long: "A 30-day staged protocol. Days 1–10: pull triggers. Days 11–20: progressive fiber + fermented foods. Days 21–30: stabilize and reintroduce systematically.",
    duration_days: 30,
    hero_color: "oklch(0.80 0.09 130)",
    features: [
      "10-day trigger elimination",
      "Progressive fiber ramp",
      "Fermented food integration",
      "Symptom + bristle-stool tracking",
    ],
    coach_context:
      "User is on the Gut Repair protocol. Avoid common irritants (high-FODMAP, alcohol, ultra-processed) early. Suggest fermented foods and soluble fiber sources progressively. Ask about symptoms before recommending changes.",
  },
  {
    id: "family-meals",
    name: "Family Meals",
    category: "household",
    short: "One menu, multiple plates. Picky-eater strategies built in.",
    long: "Designs unified family meals with per-person portion + protein scaling. Includes picky-eater pathways (decompose dishes into kid-friendly components) and allergen safety checks.",
    duration_days: 7,
    hero_color: "oklch(0.78 0.09 80)",
    features: [
      "Per-person portion scaling",
      "Picky-eater decomposition",
      "Allergen + dietary checks",
      "Side dishes that fit everyone",
    ],
    coach_context:
      "User is cooking for a family. Suggest meals that decompose well (taco bar, grain bowls, sheet-pan). Always note picky-eater swaps. Quantity should scale for 4 unless stated.",
  },
  {
    id: "workout-fuel",
    name: "Workout Fuel",
    category: "performance",
    short: "Pre, intra, post — the right fuel at the right window.",
    long: "Stanford-style sports timing: pre-workout (60-90min before), intra (long sessions), post (anabolic window). Macro splits adjusted to training day vs rest day.",
    duration_days: 14,
    hero_color: "oklch(0.74 0.11 20)",
    features: [
      "Pre-workout meals (60-90 min before)",
      "Intra-workout fueling for long sessions",
      "Post-workout protein + carb window",
      "Training-day vs rest-day macro split",
    ],
    coach_context:
      "User is on Workout Fuel — ask about training schedule before suggesting meals. Pre-workout: 30-40g carbs, 15g protein. Post-workout: 25-40g protein, 60-100g carbs depending on session length.",
  },
  {
    id: "30-day-reset",
    name: "30-Day Reset",
    category: "system",
    short: "Kitchen cleanup, foundation building, habit lock-in.",
    long: "Week 1: reset kitchen + remove temptations. Week 2: foundation meals on repeat. Week 3: build flexibility. Week 4: lock in routines that survive without the program.",
    duration_days: 30,
    hero_color: "oklch(0.78 0.08 200)",
    features: [
      "Week 1 — kitchen reset checklist",
      "Week 2 — 5 foundation meals",
      "Week 3 — flexibility expansion",
      "Week 4 — sustainable routine",
    ],
    coach_context:
      "User is on the 30-Day Reset. Anchor on a small set of foundation meals weeks 1-2. Introduce variation in week 3. Always tie suggestions back to building durable routines.",
  },
  {
    id: "therapeutic",
    name: "Therapeutic (clinician-aligned)",
    category: "medical",
    short: "Lab-aware nutrition for a chronic condition you're managing.",
    long: "Customized for a single chronic condition (high cholesterol, type 2 diabetes, hypertension, IBS). Reads recent lab values you share, designs a pattern, and surfaces medication–food interactions.",
    duration_days: 90,
    hero_color: "oklch(0.78 0.09 250)",
    features: [
      "Condition-specific food patterns",
      "Lab-value targets",
      "Medication–food interaction checks",
      "Shareable summary for your clinician",
    ],
    coach_context:
      "User is on a Therapeutic program for a managed chronic condition. Defer to their clinician for dosing or diagnosis. Suggest food patterns aligned with the condition they shared. Always recommend they verify with their care team.",
  },
];

export function getProgram(id: string): Program | undefined {
  return PROGRAMS.find((p) => p.id === id);
}

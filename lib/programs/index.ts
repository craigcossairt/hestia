// 8 curated meal-planning programs. Each maps to one of the source thread's
// 12 nutrition prompts (https://threadreaderapp.com/thread/2045826159636824423.html).
// Activating a program records it on the user's profile (or a family member's
// entry) and feeds extra context into the Coach + plan-week prompts.

export type ProgramKind = "workflow" | "pattern" | "focus";

export interface Program {
  id: string;
  name: string;
  category: string;
  // Conflict bucket — see below.
  kind: ProgramKind;
  short: string;
  long: string;
  duration_days: number;
  hero_color: string; // CSS color
  features: string[];
  // System-prompt fragment merged into the Coach when this is active.
  coach_context: string;
}

// Conflict policy:
//   workflow → stackable (no limit). Household-level only (cooking pattern
//             that affects how meals are made, not what or when). Cannot be
//             assigned to individual family members.
//   pattern  → max 1 per scope. Affects when you eat / overall eating
//             structure. Two would contradict on timing.
//   focus    → max 1 per scope. Single therapeutic / performance intent.
//             Two would contradict on dietary framing.
// "Per scope" = the user themselves OR a single family member. So Sam can be
// on Workout Fuel while you're on Gut Repair — independent scopes.

export const PROGRAMS: Program[] = [
  {
    id: "sunday-prep",
    name: "Sunday Meal Prep",
    category: "system",
    kind: "workflow",
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
    kind: "pattern",
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
    kind: "focus",
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
    kind: "focus",
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
    kind: "workflow",
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
    kind: "focus",
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
    kind: "pattern",
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
    kind: "focus",
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

// Workflow programs apply at the household level only — they describe how
// meals get cooked, not what an individual eats. Pattern + focus programs
// can be assigned per-person (you, or a specific family member).
export function assignableToMembers(kind: ProgramKind): boolean {
  return kind !== "workflow";
}

// Within a single scope (the user OR one member), activating a program of a
// non-stackable kind replaces the existing program of the same kind.
// Returns the id that should be removed (if any).
export function findConflict(
  newId: string,
  activeIds: string[],
): { replacedId: string; replacedName: string } | null {
  const incoming = getProgram(newId);
  if (!incoming || incoming.kind === "workflow") return null;
  for (const existingId of activeIds) {
    if (existingId === newId) continue; // already active
    const existing = getProgram(existingId);
    if (existing && existing.kind === incoming.kind) {
      return { replacedId: existing.id, replacedName: existing.name };
    }
  }
  return null;
}

// Order programs so the most prescriptive guidance appears first in the
// merged Coach context (focus → pattern → workflow). Used when concatenating
// coach_context fragments.
export function sortByGuidanceWeight(ids: string[]): Program[] {
  const order: Record<ProgramKind, number> = {
    focus: 0,
    pattern: 1,
    workflow: 2,
  };
  return ids
    .map(getProgram)
    .filter((p): p is Program => !!p)
    .sort((a, b) => order[a.kind] - order[b.kind]);
}

// Build the system-prompt fragment that goes into Coach + plan-week. Lists
// the user's active programs first, then per-family-member assignments.
// Returns null if nothing is active.
export function buildProgramContext(args: {
  userProgramIds: string[];
  members: Array<{ name: string; active_programs?: string[] }>;
}): string | null {
  const userPrograms = sortByGuidanceWeight(args.userProgramIds);
  const memberWithPrograms = args.members
    .map((m) => ({
      ...m,
      programs: sortByGuidanceWeight(m.active_programs ?? []),
    }))
    .filter((m) => m.programs.length > 0 && m.name?.trim());

  if (userPrograms.length === 0 && memberWithPrograms.length === 0) {
    return null;
  }

  const sections: string[] = [];

  if (userPrograms.length > 0) {
    sections.push(
      "You are following these programs:\n" +
        userPrograms.map((p) => `- ${p.name}: ${p.coach_context}`).join("\n"),
    );
  }

  if (memberWithPrograms.length > 0) {
    sections.push(
      "Household members are also on programs (factor each into per-person plates):\n" +
        memberWithPrograms
          .map(
            (m) =>
              `- ${m.name}: ${m.programs.map((p) => p.name).join(", ")}. ${m.programs.map((p) => p.coach_context).join(" ")}`,
          )
          .join("\n"),
    );
  }

  return sections.join("\n\n");
}

// Inferred slot defaults for the plan generator's Options drawer.
// Active programs nudge which optional slots (snack / dessert / beverage)
// start checked. The user can still override before clicking Generate.
//
// Heuristics (deliberately conservative — assume "off" unless a program
// strongly implies otherwise):
//   - 16-8-fasting    → no snacks/desserts/beverages outside the window
//   - workout-fuel    → snacks + beverages on (intra-workout fueling)
//   - everything else → defaults off
export interface InferredSlotDefaults {
  snack: boolean;
  dessert: boolean;
  beverage: boolean;
}

export function inferSlotDefaults(
  activeProgramIds: string[],
): InferredSlotDefaults {
  const ids = new Set(activeProgramIds);

  if (ids.has("workout-fuel")) {
    return { snack: true, dessert: false, beverage: true };
  }
  if (ids.has("16-8-fasting")) {
    return { snack: false, dessert: false, beverage: false };
  }

  return { snack: false, dessert: false, beverage: false };
}

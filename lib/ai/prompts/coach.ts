// System prompt for the Hestia coach. Distilled from the source thread's 12
// nutrition-expert prompts (Mayo, Precision Nutrition, Renaissance
// Periodization, Cleveland Clinic gut + medical, Stanford sports timing,
// Noom psychology, USDA family planning, IF protocols, 30-day reset, etc.)
// into one composite voice — calm, evidence-based, specific.
//
// The Coach voice + universal hard rules live in BASE_SYSTEM (shared across
// all generators). This file adds chat-specific structure on top.

import { BASE_SYSTEM } from "./system";

interface FamilyForCoach {
  name: string;
  age: number;
  dietary_restrictions: string[];
  allergies?: string[];
  disliked_foods?: string[];
  medical_conditions?: string[];
  notes?: string;
}

interface CoachContext {
  name?: string | null;
  goal: string | null;
  kcal_target: number | null;
  protein_target: number | null;
  carbs_target: number | null;
  fat_target: number | null;
  dietary_restrictions: string[];
  allergies?: string[];
  disliked_foods?: string[];
  medical_conditions?: string[];
  recent_meals: string[];
  pantry_highlights: string[];
  active_program_context?: string | null;
  family?: FamilyForCoach[];
}

function summariseFamilyMember(m: FamilyForCoach): string {
  const parts: string[] = [`age ${m.age}`];
  if (m.dietary_restrictions.length)
    parts.push(`prefers ${m.dietary_restrictions.join("/")}`);
  if (m.allergies?.length)
    parts.push(`ALLERGIES: ${m.allergies.join(", ")}`);
  if (m.disliked_foods?.length)
    parts.push(`dislikes ${m.disliked_foods.join(", ")}`);
  if (m.medical_conditions?.length)
    parts.push(`managing ${m.medical_conditions.join(", ")}`);
  if (m.notes) parts.push(m.notes);
  return `- ${m.name} — ${parts.join("; ")}`;
}

export function coachSystemPrompt(ctx: CoachContext) {
  const householdAllergies = new Set<string>(ctx.allergies ?? []);
  const householdConditions = new Set<string>(ctx.medical_conditions ?? []);
  for (const m of ctx.family ?? []) {
    for (const a of m.allergies ?? []) householdAllergies.add(a);
    for (const c of m.medical_conditions ?? []) householdConditions.add(c);
  }
  const householdAllergyList = [...householdAllergies];
  const householdConditionList = [...householdConditions];

  return `${BASE_SYSTEM}

---

You are operating in chat mode inside the Hestia app. Additional rules for
this surface:

- Never invent the user's targets — use the numbers they're seeing on Today.
- Three sentences max per response unless the user explicitly asks for depth.
- No emoji, no markdown headers, no bullet lists unless asked.
- If the user asks for medical advice, gently say you can suggest food
  patterns but they should bring lab work to a clinician.
${householdAllergyList.length ? `- ALLERGIES IN THIS HOUSEHOLD (NEVER violate, even if shared meals would be easier): ${householdAllergyList.join(", ")}. If a suggestion contains any, name an explicit substitution in the same sentence.` : ""}
${householdConditionList.length ? `- Medical context to factor in: ${householdConditionList.join(", ")}. Bias toward food patterns aligned with these (low-glycemic for diabetes, gluten-free for celiac, low-sodium for hypertension, low-FODMAP for IBS). Never replace a clinician — suggest, don't prescribe.` : ""}

Their current state:
- Name: ${ctx.name ?? "the user"}
- Goal: ${ctx.goal ?? "maintain"}
- Daily targets: ${ctx.kcal_target ?? "—"} kcal, ${ctx.protein_target ?? "—"}g protein, ${ctx.carbs_target ?? "—"}g carbs, ${ctx.fat_target ?? "—"}g fat
- Dietary preferences: ${ctx.dietary_restrictions.length ? ctx.dietary_restrictions.join(", ") : "none recorded"}
- Their allergies: ${ctx.allergies?.length ? ctx.allergies.join(", ") : "none recorded"}
- Foods they dislike (avoid when possible, OK to break occasionally): ${ctx.disliked_foods?.length ? ctx.disliked_foods.join(", ") : "none recorded"}
- Their medical conditions: ${ctx.medical_conditions?.length ? ctx.medical_conditions.join(", ") : "none recorded"}
- Recent logged meals: ${ctx.recent_meals.length ? ctx.recent_meals.slice(0, 6).join(", ") : "nothing yet"}
- Pantry highlights: ${ctx.pantry_highlights.length ? ctx.pantry_highlights.slice(0, 8).join(", ") : "no inventory recorded"}
${ctx.family && ctx.family.length > 0 ? `\nHousehold being cooked for:\n${ctx.family.map(summariseFamilyMember).join("\n")}\nWhen suggesting meals, factor in everyone. Use decompose-to-components style (taco bar, sheet pan + sauces on the side) for picky eaters or differing needs.` : ""}
${ctx.active_program_context ? `\nActive program guidance:\n${ctx.active_program_context}` : ""}

Bias your suggestions toward what they already have in the pantry. If a
recipe makes sense to add to the library, suggest it concisely and offer to
generate it via the +recipe button.`;
}

export interface QuickAction {
  id: string;
  label: string;
  prompt: string;
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "stuck",
    label: "I feel stuck",
    prompt:
      "I feel stuck with my eating routine — same meals, no energy. What's a small shift to try this week?",
  },
  {
    id: "dinner",
    label: "What's for dinner?",
    prompt:
      "Suggest one specific dinner I could cook tonight using what's in my pantry. Keep it simple.",
  },
  {
    id: "low-energy",
    label: "Low energy day",
    prompt:
      "Tomorrow I have a heavy training day. What should I eat the morning of, and immediately after?",
  },
  {
    id: "craving",
    label: "Craving sweet",
    prompt:
      "I keep craving something sweet around 3pm. What's going on and what's a smarter swap?",
  },
  {
    id: "gut",
    label: "Gut feels off",
    prompt:
      "My digestion has been off this week. Walk me through a 3-day reset I can try without crashing my routine.",
  },
  {
    id: "prep",
    label: "Plan my prep",
    prompt:
      "Help me plan a 90-minute Sunday prep that covers 5 lunches and 3 dinners aligned with my goal.",
  },
];

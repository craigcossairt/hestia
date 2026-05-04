// Plan-week generator. Produces a household plan that covers breakfast,
// lunch, and dinner across 7 days, plus any opt-in slots (snack, dessert,
// beverage). Each entry is a full Recipe — same schema as elsewhere — so
// the same display + edit + cook flows work uniformly.

import { z } from "zod";
import { RecipeSchema } from "./recipe";
import { withBaseSystem } from "./system";
import type { FamilyMemberForRecipe } from "./recipe";

export type PlanSlot =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "dessert"
  | "beverage";

const PlanSlotSchema = z.enum([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "beverage",
]);

// Each plan entry pairs a calendar date + slot with a fully-specified
// recipe. The generator returns one big array — the route splits and
// inserts the recipes + plan_entries.
//
// is_leftover_of_index lets the planner reuse a single cook session
// across multiple slots: a Monday dinner that yields 4 servings can
// also fill Tuesday lunch as leftovers. When set, the entry doesn't
// carry a new recipe — it points at the index of an earlier meal in
// the array whose recipe gets shared.
export const PlanWeekSchema = z.object({
  meals: z
    .array(
      z
        .object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .describe("ISO date (YYYY-MM-DD) of the day this meal lands on."),
          slot: PlanSlotSchema,
          recipe: RecipeSchema.optional().describe(
            "The cooked recipe for this slot. Omit when this slot is a " +
              "leftover of another meal in the array (use is_leftover_of_index).",
          ),
          is_leftover_of_index: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(
              "When this slot reuses an earlier meal's cook session, set " +
                "this to that meal's array index (0-based). Omit recipe in " +
                "that case. Used when the source recipe yields more " +
                "servings than the household consumes in one sitting.",
            ),
        })
        .refine(
          (m) => !!m.recipe || typeof m.is_leftover_of_index === "number",
          {
            message:
              "Each meal must have either a recipe or is_leftover_of_index.",
          },
        ),
    )
    .min(1)
    .max(60),
});

export type PlanWeekResult = z.infer<typeof PlanWeekSchema>;

interface PlanWeekArgs {
  // ISO YYYY-MM-DD for each day to plan, in order. Drives the date column.
  week_dates: string[];
  // Which slots to fill on each day. Always includes 'dinner'.
  slots: PlanSlot[];
  // The (date, slot) pairs that already have recipes assigned — generator
  // must skip these.
  existing: Array<{ date: string; slot: PlanSlot }>;

  goal: string | null;
  protein_target: number | null;
  dietary_restrictions: string[];
  household_allergies: string[];
  household_dislikes: string[];
  household_medical: string[];
  pantry_hints: string[];
  recent_recipe_names: string[];
  // Number of household members (driver of recipe servings).
  household_size: number;
  active_program_context?: string | null;
  family?: FamilyMemberForRecipe[];
}

export function planWeekPrompt(args: PlanWeekArgs) {
  const slotsLabel = args.slots.join(" + ");
  const filledList =
    args.existing.length > 0
      ? args.existing.map((e) => `${e.date}/${e.slot}`).join(", ")
      : "none";

  const familyBlock = args.family?.length
    ? `\nHousehold members eating these meals:\n${args.family
        .map(
          (m) =>
            `- ${m.name} (${m.age})` +
            (m.dietary_restrictions.length
              ? `, prefers ${m.dietary_restrictions.join("/")}`
              : "") +
            (m.allergies?.length ? `, ALLERGIES: ${m.allergies.join(", ")}` : "") +
            (m.disliked_foods?.length
              ? `, dislikes ${m.disliked_foods.join(", ")}`
              : "") +
            (m.medical_conditions?.length
              ? `, managing ${m.medical_conditions.join(", ")}`
              : "") +
            (m.portion_modifier && m.portion_modifier !== 1
              ? `, ${m.portion_modifier}× portion`
              : "") +
            (m.notes ? `; notes: ${m.notes}` : ""),
        )
        .join("\n")}\nWhen a member needs an adapted plate (allergy, dislike, portion, medical), put a short note in the recipe's family_modifications field. Skip the field entirely on recipes where no one needs adjustments.`
    : "";

  return withBaseSystem(`Generate a household meal plan for the week.

Days to plan (in order): ${args.week_dates.join(", ")}.
Slots to fill on each day: ${slotsLabel}.
Already-filled slots to SKIP (do NOT regenerate these): ${filledList}.

Output rules:
- One entry per (date, slot) pair you generate. ${args.week_dates.length * args.slots.length - args.existing.length} entries total at most.
- Each entry: { date, slot, recipe } where the recipe is a full Recipe object.
- Each recipe MUST include exactly one meal-type tag matching its slot
  (breakfast / lunch / dinner / snack / dessert / beverage).
- Servings: ~${args.household_size} adult portions per recipe unless a
  recipe is naturally bigger (a casserole that yields 6) or smaller
  (a single beverage). Use the servings field honestly.
- Honest macros — per-serving, not per-batch.

Constraints:
${args.dietary_restrictions.length ? `- Respect dietary preferences: ${args.dietary_restrictions.join(", ")}.` : ""}
${args.household_allergies.length ? `- ALLERGIES — NEVER include: ${args.household_allergies.join(", ")}. Hard rule across the household.` : ""}
${args.household_dislikes.length ? `- Avoid these disliked foods when reasonable: ${args.household_dislikes.join(", ")}.` : ""}
${args.household_medical.length ? `- Medical context: ${args.household_medical.join(", ")}. Lean toward aligned patterns (low-glycemic / gluten-free / low-sodium / low-FODMAP as applicable).` : ""}
${args.goal ? `- Aligned with goal: ${args.goal}.` : ""}
${args.protein_target ? `- Bias protein density (target ${args.protein_target}g/day).` : ""}
${args.recent_recipe_names.length ? `- Avoid repeating these recent recipes: ${args.recent_recipe_names.slice(0, 10).join(", ")}.` : ""}
${args.active_program_context ? `\nActive program guidance:\n${args.active_program_context}` : ""}
${familyBlock}

Inventory + ingredient efficiency (IMPORTANT):
${args.pantry_hints.length ? `- These items are already on hand — prefer recipes that use them: ${args.pantry_hints.slice(0, 20).join(", ")}.` : "- The user has nothing tracked in inventory yet — assume an empty kitchen."}
- Maximize cross-recipe ingredient overlap. If you suggest a 16 oz bag of
  spinach for one meal, also use it in 1–2 other meals so the bag empties.
  Same with herbs (cilantro, parsley), cheese, half-and-half, scallions.
- Choose 3–5 "anchor" base ingredients that thread through 4+ recipes.
- Avoid one-off specialty ingredients used in a single dish unless they're
  inexpensive or shelf-stable.

Leftovers (IMPORTANT for efficiency):
- Household size: ${args.household_size}. When a recipe naturally yields
  more servings than that (a casserole that makes 6, a pot of chili that
  makes 8), use the extra servings as leftovers on a later slot.
- To mark a slot as leftovers, OMIT the recipe field and set
  is_leftover_of_index to the 0-based array index of the earlier meal
  whose recipe is being reused.
- Don't force leftovers — only use them when a recipe genuinely makes
  excess. A recipe with servings exactly equal to household_size produces
  no leftovers.
- When you DO use leftovers, prefer them for the next day's lunch (not
  the next dinner) so the user gets variety at dinner.

Variety rules:
- Mix proteins across the week (don't repeat the same protein twice in a row).
- For dinners: at least one one-pan/sheet-pan, one pasta or grain dish, one
  quick (<25 min) dish, one batch-friendly leftover-able dish.
- For breakfasts: vary between hot/cold, eggs/grain/yogurt-based.
- For lunches: prefer batch-able or repurposed dinner leftovers concepts.

Return ONLY a valid object with a "meals" array. No commentary.`);
}

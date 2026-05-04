// "Refine" the current week's plan via free-text instruction. The user
// types something like "swap Tuesday dinner for something vegetarian" or
// "use up the chicken Wednesday lunch", and the AI produces a diff:
// entries to remove (by id) and entries to add (with full recipes).

import { z } from "zod";
import { RecipeSchema } from "./recipe";
import { withBaseSystem } from "./system";
import type { FamilyMemberForRecipe } from "./recipe";
import type { PlanSlot } from "./plan-week";

const PlanSlotSchema = z.enum([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "beverage",
]);

// A single addition. Either a fresh recipe OR a leftover that points at:
//   - an existing meal_plan_entry.id (is_leftover_of_existing_entry_id), OR
//   - another entry being added in this same diff (is_leftover_of_add_index).
const AdditionSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("ISO date (YYYY-MM-DD)."),
    slot: PlanSlotSchema,
    recipe: RecipeSchema.optional(),
    is_leftover_of_existing_entry_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "When this addition is leftovers from an entry that already " +
          "exists in the plan (and isn't being removed in this diff), use " +
          "its meal_plan_entries.id.",
      ),
    is_leftover_of_add_index: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "When this addition is leftovers from another addition in the " +
          "same diff, set this to that addition's array index (0-based, " +
          "into the `add` array). Forward refs are blocked at apply time.",
      ),
  })
  .refine(
    (a) =>
      !!a.recipe ||
      typeof a.is_leftover_of_existing_entry_id === "string" ||
      typeof a.is_leftover_of_add_index === "number",
    {
      message:
        "Each addition must have either a recipe or a leftover reference.",
    },
  );

export const PlanRefinementSchema = z.object({
  explanation: z
    .string()
    .min(4)
    .max(280)
    .describe(
      "One short sentence (under 200 chars) explaining what's changing " +
        "and why, in the user's voice. Example: 'Swapped Tuesday dinner " +
        "for a vegetarian curry that uses the cilantro you've got.'",
    ),
  remove: z
    .array(z.string().uuid())
    .max(40)
    .describe(
      "meal_plan_entries.id values to delete. Only include IDs that came " +
        "from the current plan — never invent new ones.",
    ),
  add: z
    .array(AdditionSchema)
    .max(30)
    .describe(
      "New plan entries to insert after the removals. Empty array is " +
        "allowed when the user only asked for removals.",
    ),
});

export type PlanRefinementResult = z.infer<typeof PlanRefinementSchema>;

interface CurrentPlanEntry {
  id: string;
  date: string;
  slot: PlanSlot;
  recipe_name: string;
  recipe_kcal: number | null;
  is_leftover_of: string | null;
}

interface RefinePlanArgs {
  user_request: string;
  current_plan: CurrentPlanEntry[];
  week_dates: string[];

  // Same household context the planner already has access to.
  goal: string | null;
  protein_target: number | null;
  dietary_restrictions: string[];
  household_allergies: string[];
  household_dislikes: string[];
  household_medical: string[];
  pantry_hints: string[];
  household_size: number;
  active_program_context?: string | null;
  family?: FamilyMemberForRecipe[];
}

export function refinePlanPrompt(args: RefinePlanArgs) {
  const planLines = args.current_plan.length
    ? args.current_plan
        .map(
          (e) =>
            `- ${e.id} | ${e.date} ${e.slot}: ${e.recipe_name}` +
            (e.recipe_kcal != null ? ` (${e.recipe_kcal} kcal)` : "") +
            (e.is_leftover_of ? ` [leftover of ${e.is_leftover_of}]` : ""),
        )
        .join("\n")
    : "(plan is empty)";

  const familyBlock = args.family?.length
    ? `\nHousehold members:\n${args.family
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
              : ""),
        )
        .join("\n")}`
    : "";

  return withBaseSystem(`The user wants to adjust their existing meal plan.
Apply the smallest diff that satisfies the request — only change the meals
they actually asked you to change.

User's request:
"${args.user_request}"

Week dates (in order): ${args.week_dates.join(", ")}.
Household size: ${args.household_size}.

Current plan (entry id | date slot: name):
${planLines}

Constraints (still apply to any new meals):
${args.dietary_restrictions.length ? `- Respect dietary preferences: ${args.dietary_restrictions.join(", ")}.` : ""}
${args.household_allergies.length ? `- ALLERGIES — NEVER include: ${args.household_allergies.join(", ")}.` : ""}
${args.household_dislikes.length ? `- Avoid these disliked foods when reasonable: ${args.household_dislikes.join(", ")}.` : ""}
${args.household_medical.length ? `- Medical context: ${args.household_medical.join(", ")}.` : ""}
${args.goal ? `- Aligned with goal: ${args.goal}.` : ""}
${args.protein_target ? `- Bias protein density (target ${args.protein_target}g/day).` : ""}
${args.pantry_hints.length ? `- Prefer pantry items where natural: ${args.pantry_hints.slice(0, 20).join(", ")}.` : ""}
${args.active_program_context ? `\nActive program guidance:\n${args.active_program_context}` : ""}
${familyBlock}

Output rules:
- Return ONLY a diff: { explanation, remove, add }.
- "remove" lists entry IDs from the current plan that should be deleted.
  IDs MUST be drawn from the list above — don't invent any.
- "add" lists new entries to insert after the removals. Each entry needs
  a full recipe OR a leftover reference (existing entry id or add-array
  index of an earlier addition).
- DO NOT include unchanged meals in either list — those stay as-is.
- Keep the explanation to one short sentence in the user's voice.

Common patterns:
- "Swap X for Y" → remove the old entry, add a new one for the same date+slot.
- "Make X a leftover of Y" → remove X, add a new leftover entry pointing
  at Y's existing id.
- "Add a snack on Wednesday" → no removes, one add with a snack recipe.
- "Use up the chicken on Wednesday" → either swap one of Wed's existing
  meals for a chicken-based recipe, or add a new entry that uses chicken.`);
}

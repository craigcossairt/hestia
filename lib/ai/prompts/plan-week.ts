// "Generate this week's dinners" — produce 7 distinct dinner recipes that
// align with goal, dietary restrictions, active program, and pantry.

import { z } from "zod";
import { RecipeSchema } from "./recipe";
import { withBaseSystem } from "./system";

export const PlanWeekSchema = z.object({
  dinners: z.array(RecipeSchema).length(7),
});

export type PlanWeekResult = z.infer<typeof PlanWeekSchema>;

interface PlanWeekArgs {
  goal: string | null;
  protein_target: number | null;
  dietary_restrictions: string[];
  // Hard rules — never violate. Aggregated across user + family.
  household_allergies: string[];
  // Soft preferences — avoid when possible.
  household_dislikes: string[];
  // Chronic conditions to factor in.
  household_medical: string[];
  pantry_hints: string[];
  recent_recipe_names: string[];
  active_program_context?: string | null;
  family_summary?: string | null;
}

export function planWeekPrompt(args: PlanWeekArgs) {
  return withBaseSystem(`Generate exactly 7 distinct DINNER recipes for the
week. Each must be:

- Realistic, written as plain prose, no marketing fluff.
- US units (cup, tbsp, tsp, oz, lb). Grams only for macros.
- Honest macros — don't pad to hit numbers.
${args.dietary_restrictions.length ? `- Respect dietary preferences: ${args.dietary_restrictions.join(", ")}.` : ""}
${args.household_allergies.length ? `- ALLERGIES — NEVER include: ${args.household_allergies.join(", ")}. This is a hard rule across the entire household.` : ""}
${args.household_dislikes.length ? `- Avoid these disliked foods when reasonable: ${args.household_dislikes.join(", ")}. Substitute equivalents.` : ""}
${args.household_medical.length ? `- Medical context to bias toward: ${args.household_medical.join(", ")}. Lean toward food patterns aligned with these (low-glycemic / gluten-free / low-sodium / low-FODMAP as applicable).` : ""}
${args.goal ? `- Aligned with goal: ${args.goal}.` : ""}
${args.protein_target ? `- Bias protein density (target ${args.protein_target}g/day).` : ""}
${args.pantry_hints.length ? `- Prefer pantry items where natural: ${args.pantry_hints.slice(0, 14).join(", ")}.` : ""}
${args.recent_recipe_names.length ? `- Avoid repeating these from the recent library: ${args.recent_recipe_names.slice(0, 10).join(", ")}.` : ""}
${args.active_program_context ? `\nActive program context:\n${args.active_program_context}` : ""}
${args.family_summary ? `\nCooking for: ${args.family_summary}\nFavor recipes that decompose for picky eaters (taco bar, sheet pan + sauces).` : ""}

Variety rules:
- Mix proteins across the week (don't repeat the same protein twice in a row).
- At least one one-pan or sheet-pan dish for an easy night.
- At least one pasta or grain-based dish.
- At least one quick (<25 min) dish for a busy night.
- At least one batch-friendly leftover-able dish.

Return ONLY a valid object with a "dinners" array of exactly 7 recipes.`);
}

// Recipe macro refinement using USDA FDC.
//
// Given a generated recipe (AI-produced ingredients + AI-estimated per-
// serving macros), look up each ingredient in FDC and compute a real
// per-serving total. If our coverage is good enough, replace the AI's
// estimate; otherwise keep the AI numbers.
//
// "Good enough" = we got real macros for ≥60% of ingredients (by count)
// AND those covered ingredients account for ≥150 kcal per serving (i.e.
// not just covering "salt and pepper"). The thresholds are conservative
// because a half-bad lookup is worse than the AI's whole-recipe guess.

import { lookupFood } from "./fdc";
import { ingredientToGrams } from "./portion";
import type { GeneratedRecipe } from "@/lib/ai/prompts/recipe";

export interface RefinedMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  // Diagnostics — not persisted, but useful for logging / future debug UI.
  coverage: number; // 0-1, fraction of ingredients we got real macros for
  matchedKcal: number; // total kcal across the matched portion (whole recipe)
}

// Spices and tiny flavorings: their macro contribution is negligible
// AND FDC's spice records often have outsized per-100g kcal (because
// they're concentrated). Skip them so they don't poison the totals.
const NEGLIGIBLE_PATTERNS = [
  /\b(salt|pepper|black pepper|white pepper)\b/i,
  /\b(cinnamon|nutmeg|paprika|cumin|oregano|thyme|basil|rosemary|sage|dill|chives|tarragon)\b/i,
  /\b(garlic powder|onion powder|chili powder|cayenne|turmeric|curry powder)\b/i,
  /\b(seasoning|spice|herb)\b/i,
  /\b(baking powder|baking soda|yeast|cream of tartar)\b/i,
  /\b(vanilla|extract|food coloring)\b/i,
];

function isNegligible(name: string): boolean {
  return NEGLIGIBLE_PATTERNS.some((p) => p.test(name));
}

interface IngredientLine {
  name: string;
  qty: number;
  unit: string;
  optional?: boolean;
}

// Run FDC lookup + portion math for one ingredient. Returns whole-
// ingredient macros (NOT per-serving). Null when we can't compute.
async function macrosForIngredient(
  ing: IngredientLine,
): Promise<{ kcal: number; protein: number; carbs: number; fat: number } | null> {
  if (ing.optional) return null;
  if (isNegligible(ing.name)) return null;

  const portion = ingredientToGrams(ing.name, ing.qty, ing.unit);
  if (!portion) return null;

  const food = await lookupFood(ing.name);
  if (!food) return null;

  // FDC gives per-100g; scale by our gram weight.
  const f = portion.grams / 100;
  return {
    kcal: food.per100g.kcal * f,
    protein: food.per100g.protein * f,
    carbs: food.per100g.carbs * f,
    fat: food.per100g.fat * f,
  };
}

// Public entrypoint. Returns refined macros (per serving) when coverage
// is sufficient, else null — caller falls back to whatever the AI
// generated.
export async function refineRecipeMacros(
  recipe: Pick<GeneratedRecipe, "ingredients" | "servings">,
): Promise<RefinedMacros | null> {
  const ingredients = recipe.ingredients ?? [];
  if (ingredients.length === 0) return null;
  const servings = Math.max(1, recipe.servings ?? 4);

  // Look up everything in parallel. The fdc.ts inflight cache dedupes
  // concurrent lookups for the same ingredient name automatically.
  const results = await Promise.all(
    ingredients.map((i) => macrosForIngredient(i)),
  );

  // Account negligible / optional ingredients as "covered" (we made an
  // intentional decision to skip them) so they don't drag coverage down.
  let matched = 0;
  let intentionalSkip = 0;
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    const r = results[i];
    if (r) {
      matched++;
      totalKcal += r.kcal;
      totalProtein += r.protein;
      totalCarbs += r.carbs;
      totalFat += r.fat;
    } else if (ing.optional || isNegligible(ing.name)) {
      intentionalSkip++;
    }
  }

  const coverage = (matched + intentionalSkip) / ingredients.length;
  // Threshold: at least 60% coverage AND at least 150 kcal of matched
  // food per serving (i.e. we covered the *substantive* ingredients,
  // not just water and seasonings).
  if (coverage < 0.6) return null;
  if (totalKcal / servings < 150) return null;

  return {
    kcal: Math.round(totalKcal / servings),
    protein: Math.round(totalProtein / servings),
    carbs: Math.round(totalCarbs / servings),
    fat: Math.round(totalFat / servings),
    coverage,
    matchedKcal: totalKcal,
  };
}

// Convenience wrapper: refine a recipe's macros and merge the refined
// values back into the recipe object, preserving everything else. If
// refinement isn't usable, returns the input unchanged.
export async function maybeRefineRecipe<
  T extends Pick<GeneratedRecipe, "ingredients" | "servings" | "kcal" | "protein" | "carbs" | "fat">,
>(recipe: T): Promise<T> {
  const refined = await refineRecipeMacros(recipe);
  if (!refined) return recipe;
  return {
    ...recipe,
    kcal: refined.kcal,
    protein: refined.protein,
    carbs: refined.carbs,
    fat: refined.fat,
  };
}

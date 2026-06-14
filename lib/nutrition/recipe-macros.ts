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

import { hasUsdaApiKey, lookupFood } from "./fdc";
import { normalizeIngredientNameForFdc } from "./normalize-ingredient-name";
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

  const searchName = normalizeIngredientNameForFdc(ing.name);
  const food = await lookupFood(searchName);
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

export type MacroRefineFailureReason =
  | "no_ingredients"
  | "missing_api_key"
  | "low_coverage"
  | "low_kcal";

export type MacroRefineResult =
  | { ok: true; macros: RefinedMacros }
  | {
      ok: false;
      reason: MacroRefineFailureReason;
      coverage: number;
      matched: number;
      intentionalSkip: number;
      total: number;
      kcalPerServing: number;
    };

export function formatMacroRefineError(
  failure: Extract<MacroRefineResult, { ok: false }>,
): string {
  switch (failure.reason) {
    case "missing_api_key":
      return "USDA_API_KEY is not configured on the server. Add it in Vercel project settings and redeploy.";
    case "no_ingredients":
      return "Add at least one ingredient before estimating macros.";
    case "low_coverage":
      return `Could not match enough ingredients in USDA (${Math.round(failure.coverage * 100)}% coverage; need 60%). Use simple names like "all-purpose flour" and remove long parenthetical notes.`;
    case "low_kcal":
      return `Matched ingredients only account for ${Math.round(failure.kcalPerServing)} kcal per serving (need 150). Check quantities and units.`;
  }
}

// Public entrypoint. Returns refined macros (per serving) when coverage
// is sufficient, else null — caller falls back to whatever the AI
// generated.
export async function refineRecipeMacrosDetailed(recipe: {
  ingredients: IngredientLine[];
  servings: number;
}): Promise<MacroRefineResult> {
  const ingredients = recipe.ingredients ?? [];
  if (ingredients.length === 0) {
    return {
      ok: false,
      reason: "no_ingredients",
      coverage: 0,
      matched: 0,
      intentionalSkip: 0,
      total: 0,
      kcalPerServing: 0,
    };
  }
  if (!hasUsdaApiKey()) {
    return {
      ok: false,
      reason: "missing_api_key",
      coverage: 0,
      matched: 0,
      intentionalSkip: 0,
      total: ingredients.length,
      kcalPerServing: 0,
    };
  }

  const servings = Math.max(1, recipe.servings ?? 4);

  const results = await Promise.all(
    ingredients.map((i) => macrosForIngredient(i)),
  );

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
  const kcalPerServing = totalKcal / servings;

  if (coverage < 0.6) {
    return {
      ok: false,
      reason: "low_coverage",
      coverage,
      matched,
      intentionalSkip,
      total: ingredients.length,
      kcalPerServing,
    };
  }
  if (kcalPerServing < 150) {
    return {
      ok: false,
      reason: "low_kcal",
      coverage,
      matched,
      intentionalSkip,
      total: ingredients.length,
      kcalPerServing,
    };
  }

  return {
    ok: true,
    macros: {
      kcal: Math.round(totalKcal / servings),
      protein: Math.round(totalProtein / servings),
      carbs: Math.round(totalCarbs / servings),
      fat: Math.round(totalFat / servings),
      coverage,
      matchedKcal: totalKcal,
    },
  };
}

export async function refineRecipeMacros(recipe: {
  ingredients: IngredientLine[];
  servings: number;
}): Promise<RefinedMacros | null> {
  const result = await refineRecipeMacrosDetailed(recipe);
  return result.ok ? result.macros : null;
}

// Convenience wrapper: refine a recipe's macros and merge the refined
// values back into the recipe object, preserving everything else. If
// refinement isn't usable, returns the input unchanged.
export async function maybeRefineRecipe<
  T extends {
    ingredients: IngredientLine[];
    servings: number;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  },
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

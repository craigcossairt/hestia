import type { Ingredient, Step } from "@/lib/types/database";
import { parseIngredientLine } from "@/lib/recipes/parse-ingredient-line";
import { parseStepTimer } from "@/lib/recipes/parse-step-timer";

/** Looks like manual create stored the full line in `name` without parsing qty. */
function looksUnparsed(ing: Ingredient): boolean {
  return ing.qty === 1 && ing.unit === "each" && ing.name.trim().length > 0;
}

export function normalizeIngredients(ingredients: Ingredient[]): Ingredient[] {
  return ingredients.map((ing) => {
    if (!looksUnparsed(ing)) return ing;
    const parsed = parseIngredientLine(ing.name);
    if (!parsed) return ing;
    if (parsed.unit === "each" && parsed.qty === 1 && parsed.name === ing.name) {
      return ing;
    }
    return { ...ing, qty: parsed.qty, unit: parsed.unit, name: parsed.name };
  });
}

export function normalizeSteps(steps: Step[]): Step[] {
  return steps.map((step) => {
    if (step.timer_sec != null && step.timer_sec > 0) return step;
    const sec = parseStepTimer(step.text);
    if (sec == null) return step;
    return { ...step, timer_sec: sec };
  });
}

/** Older edit UI stored tips as one textarea blob (one array entry with newlines). */
export function normalizeTips(tips: string[]): string[] {
  if (tips.length === 1 && tips[0].includes("\n")) {
    return tips[0]
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return tips;
}

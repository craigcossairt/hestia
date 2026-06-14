import type { GeneratedRecipe } from "@/lib/ai/prompts/recipe";

const DEFAULT_QTY_BY_UNIT: Record<string, number> = {
  each: 1,
  cup: 1,
  tbsp: 1,
  tsp: 1,
  oz: 4,
  lb: 1,
  g: 100,
  kg: 0.5,
  ml: 240,
  l: 1,
  pinch: 1,
  clove: 2,
  slice: 2,
  can: 1,
  package: 1,
  bunch: 1,
  head: 1,
  stick: 1,
};

const TO_TASTE = /\b(to taste|as needed|for garnish)\b/i;

/** When the model emits qty 0, guess from the ingredient name before unit fallback. */
const NAME_QTY_HINTS: Array<{ pattern: RegExp; qty: number; unit?: string }> = [
  { pattern: /\b(chocolate chips?|chips)\b/i, qty: 0.5, unit: "cup" },
  { pattern: /\b(sugar|brown sugar|granulated sugar)\b/i, qty: 0.75, unit: "cup" },
  { pattern: /\b(flour|all[- ]purpose)\b/i, qty: 1.5, unit: "cup" },
  { pattern: /\b(milk|cream|buttermilk)\b/i, qty: 0.25, unit: "cup" },
  { pattern: /\b(oil|olive oil|vegetable oil|canola oil)\b/i, qty: 0.25, unit: "cup" },
  { pattern: /\b(butter|margarine)\b/i, qty: 0.5, unit: "cup" },
  { pattern: /\b(vanilla|extract)\b/i, qty: 1, unit: "tsp" },
  { pattern: /\b(salt|pepper|spice)\b/i, qty: 0.25, unit: "tsp" },
  { pattern: /\b(egg)s?\b/i, qty: 2, unit: "each" },
  { pattern: /\b(banana)s?\b/i, qty: 3, unit: "each" },
];

function guessQtyFromName(name: string): { qty: number; unit?: string } | null {
  for (const hint of NAME_QTY_HINTS) {
    if (hint.pattern.test(name)) {
      return { qty: hint.qty, unit: hint.unit };
    }
  }
  return null;
}

function defaultQtyForUnit(unit: string): number {
  const normalized = unit.toLowerCase().trim().replace(/\.$/, "");
  if (DEFAULT_QTY_BY_UNIT[normalized] != null) {
    return DEFAULT_QTY_BY_UNIT[normalized];
  }
  if (normalized.endsWith("s")) {
    const singular = normalized.slice(0, -1);
    if (DEFAULT_QTY_BY_UNIT[singular] != null) {
      return DEFAULT_QTY_BY_UNIT[singular];
    }
  }
  return 1;
}

/** Fill in missing/zero quantities the model sometimes emits as 0. */
export function normalizeGeneratedRecipe<T extends GeneratedRecipe>(recipe: T): T {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ing) => {
      if (ing.qty > 0) return ing;
      if (TO_TASTE.test(ing.name)) {
        return {
          ...ing,
          qty: 1,
          unit: ing.unit?.trim() ? ing.unit : "pinch",
          optional: true,
        };
      }
      const fromName = guessQtyFromName(ing.name);
      if (fromName) {
        return {
          ...ing,
          qty: fromName.qty,
          unit: fromName.unit ?? ing.unit,
        };
      }
      return { ...ing, qty: defaultQtyForUnit(ing.unit || "each") };
    }),
  };
}

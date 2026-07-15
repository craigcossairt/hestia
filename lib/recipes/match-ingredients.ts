// Find which ingredients a cook-mode step is referring to. Used so each
// step can show the relevant qty + unit as chips ("chicken breast 1 lb")
// without forcing the cook to flip back to the ingredients list.
//
// Strategy: case-insensitive substring match with word boundaries, with
// a few sensible normalizations for plurals and common multi-word
// ingredients. Longest names are checked first so "chicken breast" wins
// over a separate "chicken" entry.
//
// Deliberately heuristic, not AI — this runs in the cook-mode render
// path which must be instant.

import { singularizeNoun as singularize } from "@/lib/grocery/singularize";
import type { Ingredient } from "@/lib/types/database";
import { formatQuantity } from "@/lib/recipes/quantity";

/** Normalize an ingredient name the same way matching does. */
function searchableIngredientName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    // Strip parenthetical asides ("(chopped)", "(approx)") — they're
    // not part of the searchable ingredient name.
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Build a regex per ingredient that matches the ingredient name as a
// whole word (case-insensitive). For a multi-word ingredient like
// "chicken breast" both words must appear in order (allowing one
// adjective like "boneless" between them via \W+\w*\W*).
function ingredientPattern(name: string): RegExp | null {
  const cleaned = searchableIngredientName(name);
  if (!cleaned) return null;

  const words = cleaned.split(" ").map(singularize).filter(Boolean);
  if (words.length === 0) return null;
  // Escape regex specials in each word.
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // Require word boundaries on the first and last word; allow the
  // middle words to appear anywhere within ~25 chars of each other.
  const middle = escaped.length === 1 ? "" : `(?:\\W+\\w*){0,3}\\W+`;
  const head = `\\b${escaped[0]}\\w*`;
  const tail = escaped.length === 1 ? "" : `${middle}${escaped[escaped.length - 1]}\\w*\\b`;
  try {
    return new RegExp(escaped.length === 1 ? `${head}\\b` : `${head}${tail}`, "i");
  } catch {
    return null;
  }
}

type MatchHit = { originalIndex: number; start: number };

// Find ingredients mentioned in step text. Longer names are matched
// first so "chicken breast" wins over a separate "chicken" entry.
// Returned hits include the character offset of the first match so
// callers can sort by mention order within the step.
function findIngredientHitsInStep(
  stepText: string,
  ingredients: Ingredient[],
): MatchHit[] {
  if (!stepText || ingredients.length === 0) return [];

  const sorted = [...ingredients]
    .map((ing, originalIndex) => ({
      ing,
      originalIndex,
      searchableLength: searchableIngredientName(ing.name).length,
    }))
    .sort(
      (a, b) =>
        b.searchableLength - a.searchableLength ||
        a.originalIndex - b.originalIndex,
    );

  let scratch = stepText;
  const hits: MatchHit[] = [];

  for (const { ing, originalIndex } of sorted) {
    const pattern = ingredientPattern(ing.name);
    if (!pattern) continue;
    const m = scratch.match(pattern);
    if (m) {
      const start = m.index ?? 0;
      hits.push({ originalIndex, start });
      // Replace the matched span with spaces so position-sensitive
      // operations stay valid; subsequent matches won't re-hit this
      // span.
      scratch =
        scratch.slice(0, start) +
        " ".repeat(m[0].length) +
        scratch.slice(start + m[0].length);
    }
  }

  return hits;
}

// Match each ingredient against the step text and return the ones that
// appear, ordered by first mention in the step (cooking order).
export function matchIngredientsInStep(
  stepText: string,
  ingredients: Ingredient[],
): Ingredient[] {
  return findIngredientHitsInStep(stepText, ingredients)
    .sort((a, b) => a.start - b.start || a.originalIndex - b.originalIndex)
    .map(({ originalIndex }) => ingredients[originalIndex]!);
}

/** Reorder ingredients by first use across recipe steps. */
export function orderIngredientsByFirstUse<T extends Ingredient>(
  ingredients: T[],
  steps: Array<{ text: string }>,
): T[] {
  if (ingredients.length <= 1 || steps.length === 0) return ingredients;

  const ordered: T[] = [];
  const seen = new Set<number>();

  for (const step of steps) {
    const hits = findIngredientHitsInStep(step.text, ingredients)
      .filter((h) => !seen.has(h.originalIndex))
      .sort((a, b) => a.start - b.start || a.originalIndex - b.originalIndex);

    for (const { originalIndex } of hits) {
      seen.add(originalIndex);
      ordered.push(ingredients[originalIndex]!);
    }
  }

  // Ingredients never mentioned in steps keep their relative order at the end.
  for (let i = 0; i < ingredients.length; i++) {
    if (!seen.has(i)) ordered.push(ingredients[i]!);
  }

  return ordered;
}

// Format an ingredient as a compact chip label: "chicken breast · 1 lb".
// Hides the unit when qty is zero (sometimes the AI emits "to taste"
// ingredients with qty=0).
export function formatIngredientChip(ing: Ingredient): string {
  if (!ing.qty || ing.qty <= 0) return ing.name;
  const qty = formatQuantity(ing.qty);
  return `${ing.name} · ${qty} ${ing.unit}`.trim();
}

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

import type { Ingredient } from "@/lib/types/database";

// Strip a trailing 's' for plural-tolerant matching, but not for words
// where the plural is a separate noun ("oats", "greens"). Keep the rule
// minimal — false negatives are fine, the user can still scan the chips
// or the full ingredient list.
function singularize(word: string): string {
  if (word.length < 4) return word;
  // Words that look plural but really aren't standalone — skip
  // singularization to avoid pathological matches.
  const KEEP_AS_IS = /(oats|greens|grits|chips|sprouts|nuts|seeds|leaves)$/;
  if (KEEP_AS_IS.test(word)) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y"; // berries → berry
  if (word.endsWith("es")) return word.slice(0, -2); // tomatoes → tomato
  if (word.endsWith("s")) return word.slice(0, -1); // onions → onion
  return word;
}

// Build a regex per ingredient that matches the ingredient name as a
// whole word (case-insensitive). For a multi-word ingredient like
// "chicken breast" both words must appear in order (allowing one
// adjective like "boneless" between them via \W+\w*\W*).
function ingredientPattern(name: string): RegExp | null {
  const cleaned = name
    .trim()
    .toLowerCase()
    // Strip parenthetical asides ("(chopped)", "(approx)") — they're
    // not part of the searchable ingredient name.
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

// Match each ingredient against the step text and return the ones that
// appear. Order in the returned array follows the original ingredients
// list so chips read naturally.
export function matchIngredientsInStep(
  stepText: string,
  ingredients: Ingredient[],
): Ingredient[] {
  if (!stepText || ingredients.length === 0) return [];
  // Sort by descending name length so longer (more-specific) ingredient
  // names are tested first against an "occupied" string. We blank out
  // matched substrings so a separate "chicken" entry doesn't double-
  // match against "chicken breast".
  const sorted = [...ingredients]
    .map((ing, originalIndex) => ({ ing, originalIndex }))
    .sort((a, b) => b.ing.name.length - a.ing.name.length);

  let scratch = stepText;
  const matchedIndices = new Set<number>();

  for (const { ing, originalIndex } of sorted) {
    const pattern = ingredientPattern(ing.name);
    if (!pattern) continue;
    const m = scratch.match(pattern);
    if (m) {
      matchedIndices.add(originalIndex);
      // Replace the matched span with spaces so position-sensitive
      // operations stay valid; subsequent matches won't re-hit this
      // span.
      const start = m.index ?? 0;
      scratch =
        scratch.slice(0, start) +
        " ".repeat(m[0].length) +
        scratch.slice(start + m[0].length);
    }
  }

  return ingredients.filter((_, i) => matchedIndices.has(i));
}

// Format an ingredient as a compact chip label: "chicken breast · 1 lb".
// Hides the unit when qty is zero (sometimes the AI emits "to taste"
// ingredients with qty=0).
export function formatIngredientChip(ing: Ingredient): string {
  if (!ing.qty || ing.qty <= 0) return ing.name;
  const qty = Number.isInteger(ing.qty) ? String(ing.qty) : ing.qty.toFixed(2).replace(/\.?0+$/, "");
  return `${ing.name} · ${qty} ${ing.unit}`.trim();
}

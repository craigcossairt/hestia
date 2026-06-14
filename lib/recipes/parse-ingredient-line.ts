// Parse a single pasted ingredient line into qty / unit / name.
// Handles unicode fractions (½, 1¾), vulgar fractions (1/2), and
// ranges (3–4) common in home-recipe copy/paste.

import { classifyAisle, type Aisle } from "@/lib/grocery/derive";
import {
  expandUnicodeFractions,
  normalizeRecipeUnit,
  parseQtyToken,
  UNIT_ALIASES,
} from "@/lib/recipes/quantity";

export interface ParsedIngredient {
  qty: number;
  unit: string;
  name: string;
  aisle?: Aisle;
}

function withAisle(
  row: Omit<ParsedIngredient, "aisle">,
): ParsedIngredient {
  return { ...row, aisle: classifyAisle(row.name) };
}

const KNOWN_UNITS = new Set(Object.values(UNIT_ALIASES));

function isKnownUnit(word: string): boolean {
  const n = normalizeRecipeUnit(word);
  return KNOWN_UNITS.has(n);
}

const QTY_PATTERN =
  /(?:\d+\s+\d+\/\d+|\d+(?:\.\d+)?(?:\/\d+)?(?:\s*-\s*\d+(?:\.\d+)?(?:\/\d+)?)?)/;

/**
 * Returns parsed fields when the line looks like "½ cup flour" or
 * "3-4 ripe bananas". Returns null when there's no leading quantity.
 */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  let text = line.trim();
  if (!text) return null;

  text = expandUnicodeFractions(text);

  // Leading parenthetical weight: "(170–200g) chocolate chips"
  const paren = text.match(
    /^\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(g|kg|oz|lb)\)\s*/i,
  );
  if (paren) {
    const avg = (Number(paren[1]) + Number(paren[2])) / 2;
    const unit = paren[3].toLowerCase();
    const name = text.slice(paren[0].length).trim();
    if (name) return withAisle({ qty: avg, unit, name });
  }

  // qty + unit + name  OR  qty + name (count)
  const withUnit = text.match(
    new RegExp(`^(${QTY_PATTERN.source})\\s+([a-zA-Z][\\w.]*)\\s+(.+)$`),
  );
  if (withUnit) {
    const qty = parseQtyToken(withUnit[1]);
    if (qty == null || qty <= 0) return null;
    const maybeUnit = withUnit[2];
    if (isKnownUnit(maybeUnit)) {
      return withAisle({
        qty,
        unit: normalizeRecipeUnit(maybeUnit),
        name: withUnit[3].trim(),
      });
    }
  }

  const countOnly = text.match(
    new RegExp(`^(${QTY_PATTERN.source})\\s+(.+)$`),
  );
  if (countOnly) {
    const qty = parseQtyToken(countOnly[1]);
    if (qty == null || qty <= 0) return null;
    const rest = countOnly[2].trim();
    // "2 large eggs" — unit is size descriptor
    const sizeMatch = rest.match(/^(large|medium|small)\s+(.+)$/i);
    if (sizeMatch) {
      return withAisle({
        qty,
        unit: sizeMatch[1].toLowerCase(),
        name: sizeMatch[2].trim(),
      });
    }
    return withAisle({ qty, unit: "each", name: rest });
  }

  return null;
}

/** Split pasted blob into lines and parse each into ingredient rows. */
export function parseIngredientPaste(blob: string): ParsedIngredient[] {
  return blob
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(
      (line) =>
        parseIngredientLine(line) ??
        withAisle({ qty: 1, unit: "each", name: line }),
    );
}

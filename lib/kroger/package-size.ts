// Parse a Kroger product's `size` field ("16 oz", "1 lb", "2 lb bag",
// "12 fl oz", "1 gallon", "12 ct") into a comparable gram weight so we
// can compute how many packages of a given product cover a recipe's
// quantity.
//
// Reuses lib/nutrition/portion.ts's ingredient→grams pipeline by
// extracting the leading qty + unit pair and pretending it's a recipe
// ingredient line. Density defaults are fine for groceries — when the
// item is a known liquid (milk, oil) the density table inside
// portion.ts already covers it; for opaque items ("16 oz of bread")
// we treat oz as weight (the more common interpretation in grocery
// labelling).

import { ingredientToGrams } from "@/lib/nutrition/portion";

// Strip noise words ("bag", "box", "carton", "container") from the
// size text so the qty + unit at the front are the only thing left.
// Also normalize a few common abbreviations Kroger uses.
function cleanSize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(bag|box|carton|container|bottle|jar|can|package|pack|pkg)\b/g, " ")
    .replace(/\b(fluid)\s+(ounce|ounces|oz)\b/g, "fl oz")
    .replace(/\b(ounce|ounces)\b/g, "oz")
    .replace(/\b(pound|pounds|lbs?)\b/g, "lb")
    .replace(/\b(gallon|gallons|gal)\b/g, "gallon")
    .replace(/\b(quart|quarts|qts?)\b/g, "qt")
    .replace(/\b(pint|pints|pts?)\b/g, "pint")
    .replace(/\b(liter|liters|litre|litres|l)\b/g, "l")
    .replace(/\b(milliliter|milliliters|ml)\b/g, "ml")
    .replace(/\b(gram|grams|g)\b/g, "g")
    .replace(/\b(kilogram|kilograms|kg)\b/g, "kg")
    .replace(/\b(count|ct|each|ea|dozen)\b/g, "each")
    .replace(/\s+/g, " ")
    .trim();
}

// "16 oz" → { qty: 16, unit: "oz" }
// "2 lb bag" → { qty: 2, unit: "lb" } (after cleanSize strips "bag")
// "12 fl oz" → { qty: 12, unit: "fl oz" }
// "1 dozen" → { qty: 1, unit: "each" } — quantity gets multiplied below
// Returns null when no leading qty+unit can be found.
function extractQtyUnit(text: string): { qty: number; unit: string } | null {
  // Match leading number (allow "1.5", ".5", "1/2" → handled below) then unit
  // text up to next space/digit.
  const m = text.match(/^(\d+(?:[./]\d+)?|\.\d+)\s*([a-z]+(?:\s+[a-z]+)?)/);
  if (!m) return null;
  let qty = parseFloat(m[1]);
  if (m[1].includes("/")) {
    const [a, b] = m[1].split("/").map(Number);
    if (b > 0) qty = a / b;
  }
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return { qty, unit: m[2].trim() };
}

export interface PackageSize {
  grams: number;
  // Sanity flag: low-confidence parses (count items without a known
  // per-item weight, fallback density assumptions) so the caller can
  // decide whether to default to qty=1 in the cart instead.
  confidence: "high" | "medium" | "low";
}

// Returns the parsed gram weight of one package, or null if we can't
// figure it out. Caller falls back to assuming "1 package covers any
// recipe" in that case (matches Phase 2 default behaviour).
export function parsePackageSize(args: {
  sizeText: string | null;
  productName?: string | null;
}): PackageSize | null {
  if (!args.sizeText) return null;
  const cleaned = cleanSize(args.sizeText);
  const parts = extractQtyUnit(cleaned);
  if (!parts) return null;

  // For "1 dozen" canonicalize to 12 each.
  let { qty } = parts;
  const { unit } = parts;
  if (/dozen/.test(args.sizeText.toLowerCase())) {
    qty *= 12;
  }

  // Pretend it's a recipe ingredient line so we hit the same density
  // tables. Use the product name (when available) to pick the right
  // density for liquids — "16 oz" of olive oil ≠ "16 oz" of water by
  // weight in any real sense (oz weight doesn't change with content,
  // but the density inference inside portion.ts assumes oz = weight
  // for opaque items, which is exactly what we want).
  const result = ingredientToGrams(args.productName ?? "package", qty, unit);
  if (!result) return null;
  return {
    grams: result.grams,
    confidence:
      result.confidence === "exact"
        ? "high"
        : result.confidence === "good"
          ? "medium"
          : "low",
  };
}

// How many packages of a given product cover a recipe's qty?
//
//   units = ceil(recipe_grams / package_grams)
//
// Returns 1 when either side is unparseable — same as the previous
// behaviour where we always sent quantity=1 to Kroger Cart.
export function computeUnitsNeeded(args: {
  recipeName: string;
  recipeQty: number;
  recipeUnit: string;
  packageSizeText: string | null;
  productName?: string | null;
}): number {
  const recipe = (() => {
    try {
      return ingredientToGrams(args.recipeName, args.recipeQty, args.recipeUnit);
    } catch {
      return null;
    }
  })();
  const pkg = parsePackageSize({
    sizeText: args.packageSizeText,
    productName: args.productName,
  });
  if (!recipe || !pkg || pkg.grams <= 0) return 1;
  // Don't pretend to be precise on low-confidence parses.
  if (recipe.confidence === "guess" && pkg.confidence === "low") return 1;
  const ratio = recipe.grams / pkg.grams;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  // Cap at a sane maximum so a unit-mismatch bug can't try to add 200
  // gallons of milk to the cart. 12 packages of any single product
  // covers any reasonable household recipe.
  return Math.min(12, Math.max(1, Math.ceil(ratio)));
}

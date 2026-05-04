// Unit normalization for the grocery list dedup. Recipes coming from the
// AI sometimes use loose "units" that are really descriptors ("hard
// boiled", "raw", "cooked") — those collide with real units and create
// duplicate rows. This module:
//
//   1. Canonicalizes known units to a singular lowercase form + tags
//      them with a category (volume / weight / count / package).
//   2. For volume + weight, exposes a base-unit conversion so the
//      consumer can sum compatible units (e.g. cups + tbsp).
//   3. For unknown / descriptor "units", hoists the value into the
//      ingredient NAME and falls back to "each" — so "eggs / hard
//      boiled" becomes "hard boiled eggs / each" and merges sanely
//      with other "each"-counted eggs entries.
//   4. Picks the most natural display unit on the way out (lb when
//      qty ≥ 16 oz, etc.).

export type UnitCategory = "volume" | "weight" | "count" | "package" | "other";

// Volumes expressed in teaspoons (smallest US kitchen volume).
const VOLUMES_TSP: Record<string, number> = {
  tsp: 1,
  teaspoon: 1,
  tbsp: 3,
  tablespoon: 3,
  "fl oz": 6,
  "fluid ounce": 6,
  cup: 48,
  pint: 96,
  pt: 96,
  quart: 192,
  qt: 192,
  gallon: 768,
  gal: 768,
  ml: 0.2029, // 1 ml ≈ 0.2029 tsp
  l: 202.9,
  liter: 202.9,
  litre: 202.9,
};

// Weights expressed in grams.
const WEIGHTS_G: Record<string, number> = {
  g: 1,
  gram: 1,
  kg: 1000,
  kilogram: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  lb: 453.592,
  pound: 453.592,
  mg: 0.001,
};

// Counts (whole-unit). Each = 1.
const COUNTS: Record<string, number> = {
  each: 1,
  ea: 1,
  count: 1,
  dozen: 12,
  doz: 12,
};

// Packaging units — kept distinct so "1 can" doesn't merge with "1 each".
const PACKAGES = new Set([
  "can",
  "box",
  "bag",
  "bottle",
  "jar",
  "carton",
  "package",
  "pack",
  "loaf",
  "stick",
  "block",
  "container",
  "head",
]);

function normalizeRaw(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    // Strip a trailing 's' for plurals — but preserve known irregulars.
    .replace(/\bcups$/, "cup")
    .replace(/\bgallons$/, "gallon")
    .replace(/\btablespoons$/, "tbsp")
    .replace(/\bteaspoons$/, "tsp")
    .replace(/\b(pounds|lbs)$/, "lb")
    .replace(/\b(ounces|ozs)$/, "oz")
    .replace(/\b(grams)$/, "g")
    .replace(/\b(kilograms|kgs)$/, "kg")
    .replace(/\b(liters|litres)$/, "l")
    .replace(/\b(milliliters|millilitres|mls)$/, "ml")
    .replace(/\b(packages|packs)$/, "package")
    .replace(/\bcans$/, "can")
    .replace(/\bboxes$/, "box")
    .replace(/\bbags$/, "bag")
    .replace(/\bbottles$/, "bottle")
    .replace(/\bjars$/, "jar")
    .replace(/\bcartons$/, "carton")
    .replace(/\bloaves$/, "loaf")
    .replace(/\bsticks$/, "stick")
    .replace(/\bblocks$/, "block")
    .replace(/\bcontainers$/, "container")
    .replace(/\bheads$/, "head")
    .replace(/\beach\.?s?$/, "each");
}

export interface CanonicalIngredient {
  // The (possibly augmented) ingredient name.
  name: string;
  // Canonical unit string (lowercase singular, e.g. "cup", "lb", "each").
  unit: string;
  category: UnitCategory;
  // Quantity expressed in the category's base unit (tsp for volume, g for
  // weight, count for everything else). Used for summing across
  // entries of the same category.
  baseQty: number;
}

// Returns a canonical (name, unit, category, baseQty) tuple. For garbage
// units, hoists the descriptor into the name.
export function canonicalize(
  rawName: string,
  rawUnit: string,
  qty: number,
): CanonicalIngredient {
  const u = normalizeRaw(rawUnit);
  const name = rawName.trim();

  if (u in VOLUMES_TSP) {
    return { name, unit: u, category: "volume", baseQty: qty * VOLUMES_TSP[u] };
  }
  if (u in WEIGHTS_G) {
    return { name, unit: u, category: "weight", baseQty: qty * WEIGHTS_G[u] };
  }
  if (u in COUNTS) {
    return { name, unit: u, category: "count", baseQty: qty * COUNTS[u] };
  }
  if (PACKAGES.has(u)) {
    // Keep the package unit visible; don't merge across package types.
    return { name, unit: u, category: "package", baseQty: qty };
  }

  // Unknown — likely a descriptor (e.g. "hard boiled", "raw", "diced").
  // Hoist it into the name so different descriptors don't get merged
  // accidentally, and treat the count as "each".
  if (u && u !== "each") {
    return {
      name: `${u} ${name}`.replace(/\s+/g, " ").trim(),
      unit: "each",
      category: "count",
      baseQty: qty,
    };
  }
  return { name, unit: "each", category: "count", baseQty: qty };
}

// Given a base-unit total and category, pick the most natural display
// unit + qty for the user.
export function displayQty(
  category: UnitCategory,
  baseQty: number,
  unitHint?: string,
): { qty: number; unit: string } {
  if (category === "volume") {
    // Pick the largest unit where qty is at least 1.
    if (baseQty >= 768) return { qty: round(baseQty / 768), unit: "gallon" };
    if (baseQty >= 192) return { qty: round(baseQty / 192), unit: "qt" };
    if (baseQty >= 96) return { qty: round(baseQty / 96), unit: "pt" };
    if (baseQty >= 48) return { qty: round(baseQty / 48), unit: "cup" };
    if (baseQty >= 3) return { qty: round(baseQty / 3), unit: "tbsp" };
    return { qty: round(baseQty), unit: "tsp" };
  }
  if (category === "weight") {
    if (baseQty >= 1000) return { qty: round(baseQty / 1000), unit: "kg" };
    if (baseQty >= 453.592) return { qty: round(baseQty / 453.592), unit: "lb" };
    if (baseQty >= 28.3495) return { qty: round(baseQty / 28.3495), unit: "oz" };
    return { qty: round(baseQty), unit: "g" };
  }
  if (category === "count") {
    return { qty: round(baseQty), unit: "each" };
  }
  // package or other — preserve the original unit since they don't convert.
  return { qty: round(baseQty), unit: unitHint ?? "" };
}

function round(n: number): number {
  // 1 decimal for fractional, integer otherwise.
  if (Number.isInteger(n)) return n;
  return Math.round(n * 10) / 10;
}

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

// Size-adjective "units" the AI sometimes emits ("medium", "large",
// "small"). They tell us nothing material about the quantity — "1
// medium apple" and "1 apple" should merge — so we drop them entirely
// and treat the entry as plain count. Without this, "apple / medium"
// and "apples / each" produce different rows on /shop.
const SIZE_ADJECTIVE_UNITS = new Set([
  "small",
  "medium",
  "med",
  "large",
  "lg",
  "xl",
  "extra large",
  "jumbo",
]);

// Singularise an ingredient name so "apples" and "apple" merge on the
// shopping list. Conservative — only the common English suffix
// transforms — and leaves words shorter than 4 chars alone (oil, egg,
// rib) plus a small block-list of words that look plural but aren't
// (oats, greens). False negatives are fine; the user can edit the
// recipe to clean it up.
function singularizeNoun(name: string): string {
  const lower = name.toLowerCase();
  if (lower.length < 4) return name;
  const KEEP_AS_IS = /(oats|greens|grits|chips|sprouts|leaves|seeds|nuts|peas|berries)$/;
  if (KEEP_AS_IS.test(lower)) return name;
  if (lower.endsWith("ies")) return name.slice(0, -3) + "y"; // berries → berry
  if (lower.endsWith("ches") || lower.endsWith("shes") || lower.endsWith("xes")) {
    return name.slice(0, -2); // peaches → peach
  }
  if (lower.endsWith("oes")) return name.slice(0, -2); // tomatoes → tomato
  if (lower.endsWith("s") && !lower.endsWith("ss")) return name.slice(0, -1);
  return name;
}

// Apply singularization to every word in a multi-word name so
// "medium apples" and "medium apple" both land on "medium apple".
// Whitespace-collapsed for stable keying.
function normalizeName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    .split(" ")
    .map((w) => singularizeNoun(w))
    .join(" ")
    .trim();
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
// units, hoists the descriptor into the name. Always singularises the
// name so "apples" / "apple" / "medium apples" / "medium apple" all
// converge on a single grocery row.
export function canonicalize(
  rawName: string,
  rawUnit: string,
  qty: number,
): CanonicalIngredient {
  const u = normalizeRaw(rawUnit);
  const name = normalizeName(rawName);

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

  // Size adjectives ("medium", "large") are descriptive, not material —
  // drop them entirely and treat as plain count. Otherwise "1 medium
  // apple" and "1 apple" stay split forever.
  if (SIZE_ADJECTIVE_UNITS.has(u)) {
    return { name, unit: "each", category: "count", baseQty: qty };
  }

  // Unknown — likely a descriptor (e.g. "hard boiled", "raw", "diced",
  // "cloves", "sprigs"). Hoist it into the name (singularised, so
  // "cloves garlic" and "clove garlic" merge) and treat as count.
  if (u && u !== "each") {
    const hoisted = singularizeNoun(u);
    return {
      name: `${hoisted} ${name}`.replace(/\s+/g, " ").trim(),
      unit: "each",
      category: "count",
      baseQty: qty,
    };
  }
  return { name, unit: "each", category: "count", baseQty: qty };
}

// Names that legitimately measure by volume at grocery scale. Anything
// not in this list gets capped at "cup" for volume display, so we don't
// produce nonsense like "1.3 gallons of spinach" or "1.1 gallons of
// seedless white grapes" when the AI aggregates cup-quantities across
// recipes (5 cups × 4 recipes = 20 cups = 960 tsp, which would
// otherwise round up to 1.25 gallon).
//
// Pattern matches whole words (case-insensitive) so descriptors like
// "ice water" or "olive oil" still hit the liquid branch.
const LIQUID_NAME_PATTERNS: RegExp[] = [
  /\b(milk|cream|yogurt|kefir|buttermilk|half[-\s]?and[-\s]?half)\b/i,
  /\b(water|juice|soda|beer|wine|kombucha|smoothie|tea|coffee|cider)\b/i,
  /\b(broth|stock|consomm[eé]|bouillon)\b/i,
  /\b(oil|vinegar|sauce|syrup|honey|molasses|dressing|marinade|paste)\b/i,
  /\b(extract|essence|flavoring)\b/i,
];

function isLiquidName(name: string): boolean {
  return LIQUID_NAME_PATTERNS.some((re) => re.test(name));
}

// Given a base-unit total and category, pick the most natural display
// unit + qty for the user. The name is used to decide whether volume
// units above "cup" make sense (liquids: yes; solids: no — see
// LIQUID_NAME_PATTERNS).
export interface DisplayOpts {
  unitHint?: string;
  name?: string;
}

export function displayQty(
  category: UnitCategory,
  baseQty: number,
  opts: DisplayOpts = {},
): { qty: number; unit: string } {
  if (category === "volume") {
    const liquid = opts.name ? isLiquidName(opts.name) : false;
    // Liquids: full hierarchy. Gallons of milk / quarts of broth / pints
    // of cream all make sense on a grocery list.
    if (liquid) {
      if (baseQty >= 768) return { qty: round(baseQty / 768), unit: "gallon" };
      if (baseQty >= 192) return { qty: round(baseQty / 192), unit: "qt" };
      if (baseQty >= 96) return { qty: round(baseQty / 96), unit: "pt" };
    }
    // Non-liquid OR unknown: cap at cup. "20 cups of spinach" reads
    // better than "1.25 gallons of spinach" on a shopping list.
    if (baseQty >= 48) return { qty: round(baseQty / 48), unit: "cup" };
    if (baseQty >= 3) return { qty: round(baseQty / 3), unit: "tbsp" };
    return { qty: round(baseQty), unit: "tsp" };
  }
  if (category === "weight") {
    // US-grocery audience (Kroger / Smith's integration is the only
    // store connector). Display in lb rather than kg even at multi-kg
    // totals, since that's what the store's shelf signage uses. Drop
    // to oz under 1 lb, to g under 1 oz for spice-scale weights.
    if (baseQty >= 453.592) return { qty: round(baseQty / 453.592), unit: "lb" };
    if (baseQty >= 28.3495) return { qty: round(baseQty / 28.3495), unit: "oz" };
    return { qty: round(baseQty), unit: "g" };
  }
  if (category === "count") {
    return { qty: round(baseQty), unit: "each" };
  }
  // package or other — preserve the original unit since they don't convert.
  return { qty: round(baseQty), unit: opts.unitHint ?? "" };
}

function round(n: number): number {
  // 1 decimal for fractional, integer otherwise.
  if (Number.isInteger(n)) return n;
  return Math.round(n * 10) / 10;
}

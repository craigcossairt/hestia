// Portion conversion: (qty, unit, ingredientName) → grams.
//
// Used to scale FDC's per-100g macros into per-recipe macros. We don't
// need pinpoint accuracy here — recipe macros are inherently estimates
// and a ±15% error on flour density is fine. The goal is to be more
// accurate than the AI's eyeballed totals, not to match a lab.
//
// Strategy:
//   - Volume → density (g/ml) lookup keyed by ingredient family. Default
//     to water (1.0) when unknown.
//   - Weight → straight unit conversion to grams.
//   - Count ("1 each", "2 large", etc.) → typical-item-weight lookup
//     for common produce + animal proteins. When unknown, return null
//     (caller treats as "skip this ingredient").
//   - Spices / tiny units → return a small fixed weight so we don't
//     skip entirely but they contribute ~nothing to macros.

import { canonicalize } from "@/lib/grocery/units";

// g per ml, keyed by ingredient family. Used when the unit is volume
// but the ingredient isn't water-like.
//
// Sources: USDA FDC household measures + standard kitchen densities.
// Defaults err toward 1.0 (water) which slightly overestimates dry
// goods; that's acceptable since dry goods are usually macro-dense and
// the kcal/g ratio matters more than the gram total.
const DENSITY_G_PER_ML: Array<{ pattern: RegExp; density: number }> = [
  // Liquids
  { pattern: /(oil|olive oil|coconut oil|vegetable oil|canola)/i, density: 0.92 },
  { pattern: /(honey|syrup|maple|molasses|agave)/i, density: 1.4 },
  { pattern: /(milk|kefir|buttermilk|cream|half-and-half|yogurt drink)/i, density: 1.03 },
  { pattern: /(broth|stock|juice|water|wine|vinegar|sauce|salsa|soup)/i, density: 1.0 },
  // Dry goods (cup volume, packed loosely)
  { pattern: /(flour|all-purpose|whole wheat|almond flour|coconut flour)/i, density: 0.53 },
  { pattern: /(sugar|brown sugar|powdered sugar|confectioners)/i, density: 0.85 },
  { pattern: /(rice|jasmine|basmati|brown rice|wild rice)/i, density: 0.79 },
  { pattern: /(oats|oatmeal|rolled oats|steel cut)/i, density: 0.42 },
  { pattern: /(cornmeal|polenta|grits|semolina)/i, density: 0.65 },
  { pattern: /(salt|table salt|kosher salt|sea salt)/i, density: 1.2 },
  { pattern: /(cocoa powder|cacao)/i, density: 0.5 },
  { pattern: /(nuts|almonds|walnuts|pecans|cashews|peanuts|pistachios)/i, density: 0.55 },
  { pattern: /(seeds|chia|flax|sesame|sunflower|pumpkin seeds)/i, density: 0.7 },
  { pattern: /(beans|lentils|chickpeas|peas)/i, density: 0.85 },
  // Produce (chopped/diced cup)
  { pattern: /(spinach|kale|lettuce|arugula|herb|cilantro|parsley|basil|mint)/i, density: 0.4 },
  { pattern: /(berr|raspb|blackb|blueb|strawb)/i, density: 0.6 },
  { pattern: /(broccoli|cauliflower|cabbage|brussels)/i, density: 0.6 },
  // Cheese (shredded)
  { pattern: /(cheese|cheddar|mozzarella|parmesan|feta|goat cheese)/i, density: 0.45 },
  // Butter (1 stick = 113g per US convention)
  { pattern: /(butter|ghee|margarine)/i, density: 0.96 },
];

function densityFor(name: string): number {
  for (const { pattern, density } of DENSITY_G_PER_ML) {
    if (pattern.test(name)) return density;
  }
  return 1.0;
}

// Typical weight (grams) for "1 each" of common items. Used when the
// recipe says "2 eggs" or "1 onion".
const PER_ITEM_GRAMS: Array<{ pattern: RegExp; grams: number }> = [
  { pattern: /\begg(s)?\b/i, grams: 50 },
  { pattern: /\b(banana|plantain)\b/i, grams: 120 },
  { pattern: /\bapple\b/i, grams: 180 },
  { pattern: /\b(orange|tangerine|clementine)\b/i, grams: 130 },
  { pattern: /\b(lemon|lime)\b/i, grams: 60 },
  { pattern: /\b(avocado)\b/i, grams: 200 },
  { pattern: /\b(potato|sweet potato|yam)\b/i, grams: 220 },
  { pattern: /\b(onion|shallot)\b/i, grams: 110 },
  { pattern: /\b(garlic clove|clove of garlic|garlic)\b/i, grams: 5 },
  { pattern: /\b(tomato)\b/i, grams: 130 },
  { pattern: /\b(carrot)\b/i, grams: 70 },
  { pattern: /\b(cucumber|zucchini|squash)\b/i, grams: 200 },
  { pattern: /\b(bell pepper|pepper)\b/i, grams: 120 },
  { pattern: /\b(jalape[ñn]o|chili|chile)\b/i, grams: 15 },
  { pattern: /\b(mushroom)\b/i, grams: 18 }, // per medium mushroom
  { pattern: /\b(chicken breast|chicken thigh)\b/i, grams: 170 },
  { pattern: /\b(salmon fillet|fish fillet|tilapia)\b/i, grams: 170 },
  { pattern: /\b(steak|beef)\b/i, grams: 200 },
  { pattern: /\b(pork chop)\b/i, grams: 180 },
  { pattern: /\b(sausage link|sausage)\b/i, grams: 75 },
  { pattern: /\b(bacon|slice of bacon)\b/i, grams: 14 },
  { pattern: /\b(slice of bread|bread slice|toast)\b/i, grams: 28 },
  { pattern: /\b(tortilla|wrap)\b/i, grams: 50 },
  { pattern: /\b(bun|bagel|muffin)\b/i, grams: 70 },
];

function perItemGrams(name: string): number | null {
  for (const { pattern, grams } of PER_ITEM_GRAMS) {
    if (pattern.test(name)) return grams;
  }
  return null;
}

// Volume base unit (tsp) → ml. 1 US tsp = 4.929 ml.
const TSP_TO_ML = 4.929;

export interface PortionResult {
  grams: number;
  // Confidence signal: "exact" = direct weight conversion, "good" = volume
  // with a known density, "guess" = volume with default density / count
  // with default per-item weight. Callers can choose to skip "guess"
  // results when refining macros (since those errors compound).
  confidence: "exact" | "good" | "guess";
}

// Convert a recipe ingredient line into an estimated gram weight. Returns
// null when conversion is impossible (e.g. unknown count item, packaging
// units like "1 can" without a known fill weight).
export function ingredientToGrams(
  name: string,
  qty: number,
  unit: string,
): PortionResult | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  // Reuse the grocery canonicaliser to normalise unit + categorise it.
  const c = canonicalize(name, unit, qty);

  // Note: canonicalize hoists unknown descriptor "units" into the name
  // and falls back to "each". So "1 hard boiled egg" arrives here as
  // name="hard boiled eggs" / unit="each" / category="count".

  if (c.category === "weight") {
    // baseQty is already grams.
    return { grams: c.baseQty, confidence: "exact" };
  }
  if (c.category === "volume") {
    // baseQty is tsp → ml → grams via density.
    const ml = c.baseQty * TSP_TO_ML;
    const density = densityFor(name);
    const grams = ml * density;
    const exact = density === 1.0 && /water|broth|stock|milk|juice/i.test(name);
    return {
      grams,
      confidence: exact
        ? "exact"
        : densityFor(name) !== 1.0
          ? "good"
          : "guess",
    };
  }
  if (c.category === "count") {
    const per = perItemGrams(c.name); // use canonical (possibly hoisted) name
    if (per != null) return { grams: c.baseQty * per, confidence: "good" };
    // Fall back to a generic medium-piece weight (~80g). Marked as guess
    // so callers can decide whether to trust it.
    return { grams: c.baseQty * 80, confidence: "guess" };
  }
  // Packaging units ("1 can", "1 box") have no reliable conversion at
  // this layer — caller should skip.
  return null;
}

import type { Ingredient, PantryItem } from "@/lib/types/database";
import {
  canonicalize,
  displayQty,
  type UnitCategory,
} from "@/lib/grocery/units";

export type Aisle =
  | "produce"
  | "protein"
  | "dairy"
  | "pantry"
  | "frozen"
  | "spices"
  | "bakery";

export const AISLE_ORDER: Aisle[] = [
  "produce",
  "protein",
  "dairy",
  "bakery",
  "frozen",
  "pantry",
  "spices",
];

export interface GroceryItem {
  key: string;
  name: string;
  qty: number;
  unit: string;
  aisle: Aisle;
  fromRecipes: string[];
}

export interface DerivedGroceryList {
  sections: Array<{ aisle: Aisle; items: GroceryItem[] }>;
  total: number;
  inPantry: number;
}

interface PlanRowForDerive {
  recipeName: string;
  ingredients: Ingredient[];
}

function classifyAisle(name: string, hint?: string): Aisle {
  if (hint && (AISLE_ORDER as string[]).includes(hint)) return hint as Aisle;
  const n = name.toLowerCase();
  if (/(spinach|kale|tomato|onion|garlic|carrot|pepper|lettuce|cucumber|berr|apple|banana|lemon|lime|broccoli|zucchini|mushroom|avocado|herb|cilantro|parsley)/.test(n))
    return "produce";
  if (/(chicken|beef|pork|turkey|salmon|tuna|shrimp|fish|tofu|tempeh|egg|sausage|bacon)/.test(n))
    return "protein";
  if (/(milk|yogurt|cheese|butter|cream|kefir|cottage)/.test(n)) return "dairy";
  if (/(frozen|ice cream|peas)/.test(n)) return "frozen";
  if (/(bread|tortilla|bun|bagel|pita)/.test(n)) return "bakery";
  if (/(salt|pepper|cumin|paprika|cinnamon|oregano|thyme|basil|chili|powder|spice|seasoning|garlic powder|onion powder|nutmeg|turmeric)/.test(n))
    return "spices";
  return "pantry";
}

interface MergedEntry {
  name: string;
  category: UnitCategory;
  baseQty: number;
  // Preserve the most-seen original unit for display purposes (especially
  // for `package` / `other` categories where we can't auto-pick).
  preferredUnit: string;
  aisle: Aisle;
  fromRecipes: Set<string>;
}

export function deriveGroceryList(args: {
  plan: PlanRowForDerive[];
  pantry: Pick<PantryItem, "name" | "qty" | "unit">[];
  overrides: Map<string, { checked: boolean }>;
  // User's "never add to shopping list" exclusions from /me. Compared
  // against the canonicalised name (lowercased + singularised) so the
  // user's "water" entry filters AI-emitted "water", "Water", "waters"
  // and even "ice water" descriptor variants alike.
  neverShop?: string[];
}): DerivedGroceryList & { checked: Set<string> } {
  // Group by canonical name + category. Sum baseQty within each group so
  // compatible volume/weight units merge automatically.
  const merged = new Map<string, MergedEntry>();
  const neverShopSet = new Set(
    (args.neverShop ?? []).map((s) => s.trim().toLowerCase()),
  );

  function pushEntry(
    rawName: string,
    rawUnit: string,
    qty: number,
    aisleHint: string | undefined,
    recipeName: string | null,
  ) {
    const c = canonicalize(rawName, rawUnit, qty);
    // Drop never-shop items at this layer so they don't show up on
    // /shop, don't get summed across recipes, and aren't sent to
    // Kroger Cart. Match against the canonicalised name (already
    // lowercased + singularised by canonicalize). Also catches
    // descriptor variants ("ice cubes" canonicalises with "ice" still
    // in the name, but exact-match is cheap so we also do an
    // includes-check as a safety net for multi-word excludes).
    const lowerName = c.name.toLowerCase();
    if (neverShopSet.has(lowerName)) return;
    for (const skip of neverShopSet) {
      // Allow user's "water" entry to also filter "ice water",
      // "spring water", etc. — but only when the excluded term is a
      // whole word in the canonicalised name.
      const re = new RegExp(`\\b${skip.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lowerName)) return;
    }
    const aisle = classifyAisle(c.name, aisleHint);
    const key = `${c.name.toLowerCase()}|${c.category}`;
    const existing = merged.get(key);
    if (existing) {
      existing.baseQty += c.baseQty;
      if (recipeName) existing.fromRecipes.add(recipeName);
    } else {
      merged.set(key, {
        name: c.name,
        category: c.category,
        baseQty: c.baseQty,
        preferredUnit: c.unit,
        aisle,
        fromRecipes: new Set(recipeName ? [recipeName] : []),
      });
    }
  }

  for (const row of args.plan) {
    for (const ing of row.ingredients) {
      pushEntry(ing.name, ing.unit, ing.qty, ing.aisle, row.recipeName);
    }
  }

  // Build pantry totals using the same canonicalization so they subtract
  // cleanly across compatible units.
  const pantryByKey = new Map<string, number>();
  for (const p of args.pantry) {
    const c = canonicalize(p.name, p.unit, p.qty);
    const key = `${c.name.toLowerCase()}|${c.category}`;
    pantryByKey.set(key, (pantryByKey.get(key) ?? 0) + c.baseQty);
  }

  // Subtract pantry, count items fully covered.
  let inPantry = 0;
  for (const [key, item] of [...merged.entries()]) {
    const have = pantryByKey.get(key) ?? 0;
    if (have <= 0) continue;
    if (have >= item.baseQty) {
      inPantry++;
      merged.delete(key);
    } else {
      item.baseQty = item.baseQty - have;
    }
  }

  // Convert each merged entry to a display-friendly { qty, unit }. Pass
  // the name through so displayQty can decide whether large volume
  // units ("gallon", "quart") apply — only for liquids like milk/oil.
  // "1.3 gallons of spinach" used to slip through here.
  const grouped = new Map<Aisle, GroceryItem[]>();
  for (const [key, item] of merged.entries()) {
    const display = displayQty(item.category, item.baseQty, {
      unitHint: item.preferredUnit,
      name: item.name,
    });
    if (display.qty <= 0) continue;
    const groceryItem: GroceryItem = {
      key: `${item.aisle}:${key}`,
      name: item.name,
      qty: display.qty,
      unit: display.unit,
      aisle: item.aisle,
      fromRecipes: [...item.fromRecipes],
    };
    const arr = grouped.get(item.aisle) ?? [];
    arr.push(groceryItem);
    grouped.set(item.aisle, arr);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  const sections = AISLE_ORDER.filter((a) => grouped.has(a)).map((aisle) => ({
    aisle,
    items: grouped.get(aisle)!,
  }));

  const checked = new Set<string>();
  for (const [k, v] of args.overrides) {
    if (v.checked) checked.add(k);
  }

  return {
    sections,
    total: sections.reduce((acc, s) => acc + s.items.length, 0),
    inPantry,
    checked,
  };
}
